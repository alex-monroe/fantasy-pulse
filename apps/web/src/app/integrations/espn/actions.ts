'use server';

import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/logger';
import { fetchJson } from '@roster-loom/core';
import { logDuration, startTimer } from '@/utils/performance-logger';

const ESPN_BASE_URL = 'https://fantasy.espn.com/apis/v3/games/ffl/seasons';

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
  season = currentEspnSeason()
) {
  const url = `${ESPN_BASE_URL}/${season}/segments/0/leagues/${leagueId}?${views
    .map((view) => `view=${view}`)
    .join('&')}`;

  return fetchJson<any>(url, {
    headers: {
      Cookie: espnCookieHeader(espnS2, swid),
      Accept: 'application/json',
    },
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
  const { data, error, status } = await fetchJson<any>(
    `${ESPN_BASE_URL}/${currentEspnSeason()}/segments/0/leagues/${trimmedLeagueId}?view=mTeam&view=mSettings`,
    {
      headers: {
        Cookie: espnCookieHeader(espnS2, swid),
        Accept: 'application/json',
      },
    }
  );
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
    { onConflict: 'league_id' }
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
    { onConflict: 'team_key' }
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

  const { data, error } = await supabase
    .from('fp_user_integrations')
    .select('id, created_at, user_id, provider, provider_user_id')
    .eq('user_id', user.id)
    .eq('provider', 'espn')
    .single();

  if (error && error.code !== 'PGRST116') {
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

/**
 * Gets the current-week matchup (team totals only) for an ESPN team.
 *
 * ESPN's box score payload is deeply nested and stat-code driven; this
 * intentionally returns team-level totals rather than a full per-player
 * breakdown. See README.md for notes on extending this to player detail.
 * @param integrationId - The integration ID (used to look up stored cookies).
 * @param leagueId - The ESPN league ID.
 * @param teamId - The ESPN team ID.
 */
export async function getEspnMatchup(integrationId: number, leagueId: string, teamId: string) {
  const supabase = createClient();
  const { data: integration, error: integrationError } = await supabase
    .from('fp_user_integrations')
    .select('espn_s2, swid')
    .eq('id', integrationId)
    .single();

  if (integrationError || !integration?.espn_s2 || !integration?.swid) {
    return { error: 'ESPN integration not found or missing credentials.' };
  }

  const fetchStart = startTimer();
  const { data, error, status } = await fetchEspnLeague(
    leagueId,
    integration.espn_s2,
    integration.swid,
    ['mMatchupScore', 'mTeam']
  );
  logEspnApiDuration('fetch matchup', fetchStart, { integrationId, leagueId, teamId, success: !error });

  if (status === 401 || status === 403) {
    return {
      error:
        'ESPN rejected the stored credentials. Reconnect the integration with fresh espn_s2/SWID cookies.',
    };
  }
  if (error || !data) {
    return { error: `Failed to fetch matchup from ESPN: ${error || 'unknown error'}` };
  }

  const numericTeamId = Number(teamId);
  const currentPeriod = data.status?.currentMatchupPeriod;
  const schedule = (data.schedule ?? []) as any[];
  const matchup = schedule.find(
    (m) =>
      m.matchupPeriodId === currentPeriod &&
      (m.home?.teamId === numericTeamId || m.away?.teamId === numericTeamId)
  );

  if (!matchup) {
    return { matchup: null };
  }

  const teamsById = new Map((data.teams ?? []).map((team: any) => [team.id, team]));
  const isHome = matchup.home?.teamId === numericTeamId;
  const userSide = isHome ? matchup.home : matchup.away;
  const opponentSide = isHome ? matchup.away : matchup.home;
  const userTeam = teamsById.get(userSide?.teamId);
  const opponentTeam = teamsById.get(opponentSide?.teamId);

  return {
    matchup: {
      week: currentPeriod,
      userTeam: {
        teamId: String(userSide?.teamId),
        name: userTeam ? espnTeamName(userTeam) : undefined,
        logo_url: userTeam?.logo,
        totalPoints: userSide?.totalPoints ?? 0,
      },
      opponentTeam: {
        teamId: String(opponentSide?.teamId),
        name: opponentTeam ? espnTeamName(opponentTeam) : undefined,
        logo_url: opponentTeam?.logo,
        totalPoints: opponentSide?.totalPoints ?? 0,
      },
    },
  };
}
