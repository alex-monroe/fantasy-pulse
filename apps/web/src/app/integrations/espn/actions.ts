'use server';

import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/logger';
import { fetchJson } from '@roster-loom/core';
import { logDuration, startTimer } from '@/utils/performance-logger';

// fantasy.espn.com/apis/v3/... now 302-redirects to an HTML login page
// instead of returning JSON errors, regardless of credential validity —
// use the read API's actual host so 401/403 responses come back as JSON.
const ESPN_BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';

function normalizeSwid(swid: string) {
  const trimmed = swid.trim();
  return trimmed.startsWith('{') ? trimmed : `{${trimmed.replace(/[{}]/g, '')}}`;
}

function espnCookieHeader(espnS2: string, swid: string) {
  return `espn_s2=${espnS2.trim()}; SWID=${normalizeSwid(swid)}`;
}

function currentEspnSeason() {
  // ESPN's fantasy "season" is the year the NFL season kicks off (e.g. the
  // 2026 season runs Sep 2026 - Jan 2027 and is addressed as season 2026
  // year-round), so the current calendar year is always the right default.
  return new Date().getFullYear();
}

function logEspnApiDuration(action: string, start: number, metadata?: Record<string, unknown>) {
  logDuration(`espn: ${action}`, start, { provider: 'espn', ...metadata });
}

async function fetchEspnLeague(
  leagueId: string,
  espnS2: string,
  swid: string,
  views: string[],
  options: { season?: number; scoringPeriodId?: number } = {}
) {
  const { season = currentEspnSeason(), scoringPeriodId } = options;

  const query = views.map((view) => `view=${view}`);
  // ESPN only fills in a matchup's lineups
  // (`rosterForCurrentScoringPeriod`) for the scoring period the request
  // names. Leave `scoringPeriodId` off and the key still comes back — with
  // an empty `entries` array — which is what left ESPN teams rendering as
  // a score with no players behind it.
  if (typeof scoringPeriodId === 'number' && Number.isFinite(scoringPeriodId)) {
    query.push(`scoringPeriodId=${scoringPeriodId}`);
  }

  const url = `${ESPN_BASE_URL}/${season}/segments/0/leagues/${leagueId}?${query.join('&')}`;

  return fetchJson<any>(url, {
    headers: {
      Cookie: espnCookieHeader(espnS2, swid),
      Accept: 'application/json',
    },
    // Live scoring data, same as the Sleeper and Yahoo matchup fetches:
    // never serve it from fetchJson's shared one-hour cache.
    disableCache: true,
  });
}

/**
 * Finds the team owned by the given SWID within an ESPN league's `mTeam` payload.
 * @param leagueData - The league payload from the ESPN API (with the `mTeam` view).
 * @param swid - The user's ESPN SWID, e.g. `{ABC123...}`.
 * @returns The owned team, or undefined if none matched.
 */
function findOwnedTeam(leagueData: any, swid: string) {
  const normalized = normalizeSwid(swid).toLowerCase();
  const teams = leagueData?.teams ?? [];
  return teams.find((team: any) =>
    (team.owners ?? []).some((owner: string) => owner.toLowerCase() === normalized)
  );
}

function espnTeamName(team: any) {
  if (team?.name) return team.name;
  const location = team?.location ?? '';
  const nickname = team?.nickname ?? '';
  const combined = `${location} ${nickname}`.trim();
  return combined || `Team ${team?.id}`;
}

// ESPN's fantasy API is undocumented and identifies positions/pro teams by
// numeric codes rather than names. These tables are reverse-engineered and
// stable across the wider ESPN fantasy tooling ecosystem (e.g. the
// `espn-api` Python package), but ESPN could change them without notice.
//
// Two *different* numeric scales are in play and they do not line up: a
// player's own position lives in `player.defaultPositionId` (QB is 1),
// while the slot they occupy in a lineup lives in `entry.lineupSlotId`
// (the QB slot is 0). Reading one with the other's table is how every ESPN
// quarterback ended up labelled "TQB".
const ESPN_POSITION_ABBREVIATIONS: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'D/ST',
};

const ESPN_LINEUP_SLOT_ABBREVIATIONS: Record<number, string> = {
  0: 'QB',
  1: 'TQB',
  2: 'RB',
  3: 'RB/WR',
  4: 'WR',
  5: 'WR/TE',
  6: 'TE',
  7: 'OP',
  16: 'D/ST',
  17: 'K',
  23: 'FLEX',
};

const ESPN_PRO_TEAM_ABBREVIATIONS: Record<number, string> = {
  0: 'FA',
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WSH',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
};

// Roster slot IDs for the bench (20) and injured reserve (21) — anything
// else is an active lineup slot.
const ESPN_BENCH_LINEUP_SLOT_IDS = new Set([20, 21]);

export type EspnRosterPlayer = {
  id: string;
  name: string;
  position: string;
  realTeam: string;
  points: number;
  onBench: boolean;
};

/**
 * Resolves a player's position label, preferring their own
 * `defaultPositionId` and falling back to the lineup slot they're in for
 * the IDP/oddball ids the table above deliberately leaves out.
 * @param player - The `playerPoolEntry.player` object from ESPN.
 * @param lineupSlotId - The roster entry's lineup slot id.
 * @returns A position abbreviation, or an empty string if neither maps.
 */
function espnPlayerPosition(player: any, lineupSlotId: unknown): string {
  const fromPosition = ESPN_POSITION_ABBREVIATIONS[player?.defaultPositionId];
  if (fromPosition) {
    return fromPosition;
  }

  if (typeof lineupSlotId === 'number' && !ESPN_BENCH_LINEUP_SLOT_IDS.has(lineupSlotId)) {
    return ESPN_LINEUP_SLOT_ABBREVIATIONS[lineupSlotId] ?? '';
  }

  return '';
}

function mapEspnRosterEntry(entry: any): EspnRosterPlayer {
  const player = entry?.playerPoolEntry?.player ?? {};
  const id = player.id != null ? String(player.id) : entry?.playerId != null ? String(entry.playerId) : '';
  const name =
    player.fullName ||
    `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() ||
    'Unknown Player';

  return {
    id,
    name,
    position: espnPlayerPosition(player, entry?.lineupSlotId),
    realTeam: ESPN_PRO_TEAM_ABBREVIATIONS[player.proTeamId] ?? '',
    points: Number(entry?.playerPoolEntry?.appliedStatTotal ?? entry?.appliedStatTotal ?? 0) || 0,
    onBench: ESPN_BENCH_LINEUP_SLOT_IDS.has(entry?.lineupSlotId),
  };
}

/**
 * Picks the first roster source that actually has entries.
 *
 * ESPN returns several roster shapes on one payload and the unhelpful ones
 * are present-but-empty rather than missing, so `??` chaining would stop at
 * the first empty array instead of falling through to the roster that has
 * the players in it.
 * @param candidates - Roster entry arrays in order of preference.
 * @returns The first non-empty array, or an empty array.
 */
function firstNonEmptyRoster(...candidates: unknown[]): any[] {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }
  }
  return [];
}

/**
 * Validates ESPN cookie credentials against a league and, if valid, connects
 * the league to the user's account.
 *
 * ESPN has no OAuth flow for fantasy data — the `espn_s2` and `swid` values
 * are copied by the user from their browser's cookies for a logged-in ESPN
 * session. See `README.md` for how those are obtained and how long they
 * tend to remain valid.
 * @param leagueId - The ESPN league ID (from the league's URL).
 * @param espnS2 - The `espn_s2` cookie value.
 * @param swid - The `SWID` cookie value.
 * @returns The connected team and league info, or an error.
 */
export async function connectEspn(leagueId: string, espnS2: string, swid: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in to connect your ESPN account.' };
  }

  const trimmedLeagueId = leagueId.trim();
  if (!trimmedLeagueId) {
    return { error: 'ESPN league ID is required.' };
  }
  if (!espnS2.trim() || !swid.trim()) {
    return { error: 'Both espn_s2 and SWID are required.' };
  }

  const fetchStart = startTimer();
  const { data, error, status } = await fetchEspnLeague(trimmedLeagueId, espnS2, swid, [
    'mTeam',
    'mSettings',
  ]);
  logEspnApiDuration('connect league', fetchStart, { leagueId: trimmedLeagueId, success: !error });

  if (status === 401 || status === 403) {
    return {
      error:
        'ESPN rejected those credentials. Your espn_s2/SWID cookies may be stale — see README.md for how to grab fresh ones.',
    };
  }
  if (error || !data) {
    logger.error({ error }, 'ESPN API error connecting league');
    return { error: `Failed to fetch league from ESPN: ${error || 'unknown error'}` };
  }

  const ownedTeam = findOwnedTeam(data, swid);
  if (!ownedTeam) {
    return { error: "Could not find a team owned by this ESPN account in that league." };
  }

  // Reconnecting (e.g. after refreshing stale cookies) should replace any
  // existing ESPN integration for this user, not accumulate a new
  // fp_user_integrations row alongside it — otherwise every retry leaves
  // its own duplicate integration/league/team rows behind, which shows up
  // as repeated matchups on the dashboard.
  const { data: existingIntegrations } = await supabase
    .from('fp_user_integrations')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'espn');

  if (existingIntegrations?.length) {
    const existingIds = existingIntegrations.map((row: { id: number }) => row.id);
    await supabase.from('fp_teams').delete().in('user_integration_id', existingIds);
    await supabase.from('fp_leagues').delete().in('user_integration_id', existingIds);
    await supabase.from('fp_user_integrations').delete().in('id', existingIds);
  }

  const { data: integration, error: insertError } = await supabase
    .from('fp_user_integrations')
    .insert({
      user_id: user.id,
      provider: 'espn',
      provider_user_id: normalizeSwid(swid),
      espn_s2: espnS2.trim(),
      swid: normalizeSwid(swid),
    })
    .select()
    .single();

  if (insertError) {
    return { error: insertError.message };
  }

  const { error: leagueError } = await supabase.from('fp_leagues').upsert(
    {
      league_id: trimmedLeagueId,
      name: data.settings?.name ?? `ESPN League ${trimmedLeagueId}`,
      user_integration_id: integration.id,
      season: String(data.seasonId ?? currentEspnSeason()),
      total_rosters: data.settings?.scheduleSettings?.matchupPeriodCount
        ? undefined
        : (data.teams ?? []).length || undefined,
      status: data.status?.currentMatchupPeriod ? 'in_season' : undefined,
    },
    { onConflict: 'league_id,user_integration_id' }
  );

  if (leagueError) {
    return { error: leagueError.message };
  }

  const { error: teamError } = await supabase.from('fp_teams').upsert(
    {
      user_integration_id: integration.id,
      team_key: `espn.${trimmedLeagueId}.${ownedTeam.id}`,
      team_id: String(ownedTeam.id),
      name: espnTeamName(ownedTeam),
      logo_url: ownedTeam.logo,
      league_id: trimmedLeagueId,
    },
    { onConflict: 'team_key,user_integration_id' }
  );

  if (teamError) {
    return { error: teamError.message };
  }

  return {
    integration,
    team: { teamId: String(ownedTeam.id), name: espnTeamName(ownedTeam) },
    league: { leagueId: trimmedLeagueId, name: data.settings?.name },
  };
}

/**
 * Removes an ESPN integration from the user's account.
 * @param integrationId - The ID of the integration to remove.
 */
export async function removeEspnIntegration(integrationId: number) {
  const supabase = createClient();

  const { error: deleteTeamsError } = await supabase
    .from('fp_teams')
    .delete()
    .eq('user_integration_id', integrationId);
  if (deleteTeamsError) {
    return { error: `Failed to delete teams: ${deleteTeamsError.message}` };
  }

  const { error: deleteLeaguesError } = await supabase
    .from('fp_leagues')
    .delete()
    .eq('user_integration_id', integrationId);
  if (deleteLeaguesError) {
    return { error: `Failed to delete leagues: ${deleteLeaguesError.message}` };
  }

  const { error: deleteIntegrationError } = await supabase
    .from('fp_user_integrations')
    .delete()
    .eq('id', integrationId);
  if (deleteIntegrationError) {
    return { error: `Failed to delete integration: ${deleteIntegrationError.message}` };
  }

  return { success: true };
}

/**
 * Gets the ESPN integration for the current user.
 */
export async function getEspnIntegration() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  // Ordered + limited to one rather than `.single()`: a user could have
  // more than one stored row from before connectEspn started cleaning up
  // duplicates on reconnect, and `.single()` hard-errors on more than one
  // match rather than just giving us the most recent.
  const { data, error } = await supabase
    .from('fp_user_integrations')
    .select('id, created_at, user_id, provider, provider_user_id')
    .eq('user_id', user.id)
    .eq('provider', 'espn')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  return { integration: data };
}

/**
 * Gets the leagues linked to an ESPN integration.
 * @param integrationId - The integration ID.
 */
export async function getLeagues(integrationId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('fp_leagues')
    .select('*')
    .eq('user_integration_id', integrationId);

  if (error) {
    return { error: error.message };
  }

  return { leagues: data };
}

/**
 * Gets the teams linked to an ESPN integration.
 * @param integrationId - The integration ID.
 */
export async function getTeams(integrationId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('fp_teams')
    .select('*')
    .eq('user_integration_id', integrationId);

  if (error) {
    return { error: error.message };
  }

  return { teams: data };
}

/** The views the matchup payload needs: schedule, scores, teams, rosters. */
const ESPN_MATCHUP_VIEWS = ['mMatchup', 'mMatchupScore', 'mTeam', 'mRoster'];

/**
 * Returns the first candidate that reads as a finite number.
 * @param candidates - Values in order of preference.
 * @returns The first finite number, or 0 when none qualify.
 */
function firstFiniteNumber(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') {
      continue;
    }
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

/** Trims the float noise that summing per-player points introduces. */
function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Reads a matchup side's score, preferring ESPN's live total.
 *
 * While games are being played ESPN keeps the running score in
 * `totalPointsLive` and leaves `totalPoints` sitting at the value the
 * matchup period opened with -- 0 for most of a Sunday -- only settling it
 * once the period is finalised. Reading `totalPoints` alone is what left
 * the scoreboard frozen on the opening score while players were visibly
 * scoring. Outside live scoring the live key is absent entirely, so
 * `totalPoints` stays the authority for finished weeks.
 * @param side - The `home`/`away` object from a schedule entry.
 * @param players - The side's mapped roster, summed as a last resort.
 * @returns The side's current score, rounded to two decimals.
 */
function espnSideScore(side: any, players: EspnRosterPlayer[]): number {
  const reported = firstFiniteNumber(side?.totalPointsLive, side?.totalPoints);
  if (reported !== 0) {
    return roundScore(reported);
  }

  // Both totals came back missing or zero while the lineup we just parsed
  // has points on it: ESPN is contradicting itself, so trust the players.
  const startersTotal = players.reduce(
    (sum, player) => (player.onBench ? sum : sum + player.points),
    0
  );

  return roundScore(startersTotal);
}

/**
 * Reshapes an ESPN league payload into the current head-to-head matchup for
 * one team, including both lineups.
 * @param data - The league payload from the ESPN API.
 * @param teamId - The ESPN team id to build the matchup around.
 * @returns The matchup, or null when the team has none this period.
 */
function buildEspnMatchup(data: any, teamId: string) {
  const numericTeamId = Number(teamId);
  const currentPeriod = data?.status?.currentMatchupPeriod;
  const schedule = (data?.schedule ?? []) as any[];
  const matchup = schedule.find(
    (m) =>
      m.matchupPeriodId === currentPeriod &&
      (m.home?.teamId === numericTeamId || m.away?.teamId === numericTeamId)
  );

  if (!matchup) {
    return null;
  }

  const teamsById = new Map((data?.teams ?? []).map((team: any) => [team.id, team]));
  const isHome = matchup.home?.teamId === numericTeamId;

  const buildSide = (side: any) => {
    const team: any = teamsById.get(side?.teamId);
    // `rosterForCurrentScoringPeriod` is the live lineup, but ESPN only
    // populates it for the scoring period the request asked for;
    // `rosterForMatchupPeriod` covers a finished period, and the team's
    // own `roster` is the season-long fallback (e.g. before kickoff).
    const players = firstNonEmptyRoster(
      side?.rosterForCurrentScoringPeriod?.entries,
      side?.rosterForMatchupPeriod?.entries,
      team?.roster?.entries
    ).map((entry) => mapEspnRosterEntry(entry));

    return {
      teamId: String(side?.teamId),
      name: team ? espnTeamName(team) : undefined,
      logo_url: team?.logo,
      totalPoints: espnSideScore(side, players),
      players,
    };
  };

  return {
    week: currentPeriod,
    userTeam: buildSide(isHome ? matchup.home : matchup.away),
    opponentTeam: buildSide(isHome ? matchup.away : matchup.home),
  };
}

/**
 * Gets the current-week matchup for an ESPN team, with both lineups.
 * @param integrationId - The integration ID (used to look up stored cookies).
 * @param leagueId - The ESPN league ID.
 * @param teamId - The ESPN team ID.
 * @param week - The current NFL week, used as ESPN's `scoringPeriodId` so
 *   the payload comes back with lineups attached. Omitting it costs an
 *   extra round trip (the retry below), it does not change the result.
 */
export async function getEspnMatchup(
  integrationId: number,
  leagueId: string,
  teamId: string,
  week?: number
) {
  const supabase = createClient();
  const { data: integration, error: integrationError } = await supabase
    .from('fp_user_integrations')
    .select('espn_s2, swid')
    .eq('id', integrationId)
    .single();

  if (integrationError || !integration?.espn_s2 || !integration?.swid) {
    return { error: 'ESPN integration not found or missing credentials.' };
  }

  const fetchLeague = async (scoringPeriodId?: number) => {
    const fetchStart = startTimer();
    const result = await fetchEspnLeague(
      leagueId,
      integration.espn_s2,
      integration.swid,
      ESPN_MATCHUP_VIEWS,
      { scoringPeriodId }
    );
    logEspnApiDuration('fetch matchup', fetchStart, {
      integrationId,
      leagueId,
      teamId,
      scoringPeriodId,
      success: !result.error,
    });
    return result;
  };

  const requestedPeriod = typeof week === 'number' && Number.isFinite(week) ? week : undefined;
  const { data, error, status } = await fetchLeague(requestedPeriod);

  if (status === 401 || status === 403) {
    return {
      error:
        'ESPN rejected the stored credentials. Reconnect the integration with fresh espn_s2/SWID cookies.',
    };
  }
  if (error || !data) {
    return { error: `Failed to fetch matchup from ESPN: ${error || 'unknown error'}` };
  }

  let matchup = buildEspnMatchup(data, teamId);

  if (!matchup) {
    return { matchup: null };
  }

  // Empty lineups on both sides means the scoring period we asked for
  // wasn't the one ESPN has rosters for. The payload names its own current
  // period, so retry with that once rather than showing a bare score.
  if (!matchup.userTeam.players.length && !matchup.opponentTeam.players.length) {
    const leaguePeriod =
      data.scoringPeriodId ?? data.status?.latestScoringPeriod ?? data.status?.currentMatchupPeriod;

    if (typeof leaguePeriod === 'number' && leaguePeriod !== requestedPeriod) {
      const retry = await fetchLeague(leaguePeriod);
      const retriedMatchup = retry.data ? buildEspnMatchup(retry.data, teamId) : null;

      if (
        retriedMatchup &&
        (retriedMatchup.userTeam.players.length || retriedMatchup.opponentTeam.players.length)
      ) {
        matchup = retriedMatchup;
      }
    }
  }

  if (!matchup.userTeam.players.length) {
    logger.warn(
      {
        integrationId,
        leagueId,
        teamId,
        requestedPeriod,
        leagueScoringPeriod: data.scoringPeriodId,
        currentMatchupPeriod: data.status?.currentMatchupPeriod,
      },
      'ESPN matchup returned no roster entries'
    );
  }

  return { matchup };
}
