'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { fetchJson } from '@roster-loom/core';
import {
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SleeperUser,
  SleeperPlayer,
  SleeperEnrichedMatchup,
  SleeperProjection,
  SleeperNflState,
} from '@roster-loom/core';

// api.sleeper.app hosts Sleeper's documented, stable endpoints (leagues,
// rosters, users, players). api.sleeper.com hosts /projections and /stats,
// which are open and unauthenticated but not in Sleeper's published
// endpoint list — permission to use them is clear, but the shape is not
// guaranteed to stay stable, hence the validation in getWeeklyProjections.
const SLEEPER_STATS_BASE = 'https://api.sleeper.com';

/** Positions the scoreboard cares about; excludes Sleeper's IDP stats. */
const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

const PROJECTION_SENTINEL_KEYS = ['pass_yd', 'rush_yd', 'rec_yd', 'rec'];

/**
 * Connects a Sleeper account to the user's account.
 * @param username - The Sleeper username to connect.
 * @returns The Sleeper user object or an error.
 */
export async function connectSleeper(username: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in to connect your Sleeper account.' };
  }

  try {
    const { data: sleeperUser, error } = await fetchJson<SleeperUser>(
      `https://api.sleeper.app/v1/user/${username}`
    );
    if (error) {
      return { error: error || 'Failed to fetch user' };
    }
    if (!sleeperUser) {
      return { error: 'User not found' };
    }

    const { error: insertError } = await supabase
      .from('fp_user_integrations')
      .insert({
        user_id: user.id,
        provider: 'sleeper',
        provider_user_id: sleeperUser.user_id,
      });

    if (insertError) {
      return { error: insertError.message };
    }

    return { user: sleeperUser };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Removes a Sleeper integration from the user's account.
 * @param integrationId - The ID of the integration to remove.
 * @returns A success message or an error.
 */
export async function removeSleeperIntegration(integrationId: number) {
  const supabase = createClient();

  // First, delete all leagues associated with the integration
  const { error: deleteLeaguesError } = await supabase
    .from('fp_leagues')
    .delete()
    .eq('user_integration_id', integrationId);

  if (deleteLeaguesError) {
    return { error: `Failed to delete leagues: ${deleteLeaguesError.message}` };
  }

  // Then, delete the integration itself
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
 * Gets the leagues for a Sleeper integration.
 * @param integrationId - The ID of the integration.
 * @returns A list of leagues or an error.
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
 * Gets the Sleeper integration for the current user.
 * @returns The Sleeper integration or an error.
 */
export async function getSleeperIntegration() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { data, error } = await supabase
    .from('fp_user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'sleeper')
    .single();

  if (error && error.code !== 'PGRST116') { // ignore no rows found error
    return { error: error.message };
  }

  return { integration: data };
}

/**
 * Fetches a user's Sleeper leagues for the current NFL season directly from
 * the Sleeper API, without touching the database.
 *
 * Sleeper mints a brand-new `league_id` for every season (the prior season's
 * league lives on as `previous_league_id`), so the scoreboard must resolve
 * leagues live each season rather than trusting the copy saved at connect
 * time. See {@link getSleeperLeagues} for the connect-time persist path.
 * @param userId - The Sleeper user ID.
 * @returns The current season's leagues or an error.
 */
export async function getCurrentSleeperLeagues(userId: string) {
  try {
    const year = new Date().getFullYear();
    const { data: leagues, error } = await fetchJson<SleeperLeague[]>(
      `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${year}`
    );
    if (error) {
      return { error };
    }

    return { leagues: leagues ?? [] };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets the Sleeper leagues for a user and inserts them into the database.
 * @param userId - The Sleeper user ID.
 * @param integrationId - The ID of the integration.
 * @returns A list of leagues or an error.
 */
export async function getSleeperLeagues(userId: string, integrationId: number) {
  const supabase = createClient();
  try {
    const { leagues, error } = await getCurrentSleeperLeagues(userId);
    if (error) {
      return { error };
    }

    if (leagues && leagues.length > 0) {
      const leaguesToInsert = leagues.map((league: SleeperLeague) => ({
        league_id: league.league_id,
        name: league.name,
        user_integration_id: integrationId,
        season: league.season,
        total_rosters: league.total_rosters,
        status: league.status,
      }));

      const { error: insertError } = await supabase.from('fp_leagues').upsert(leaguesToInsert);
      if (insertError) {
        return { error: insertError.message };
      }
    }

    return { leagues };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets the matchups for a league and week.
 * @param leagueId - The ID of the league.
 * @param week - The week to get matchups for.
 * @returns A list of matchups or an error.
 */
export async function getMatchups(leagueId: string, week: string) {
  try {
    const url = `https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`;
    const { data: matchups, error } = await fetchJson<SleeperMatchup[]>(url, {
      disableCache: true,
    });
    if (error) {
      return { error };
    }
    return { matchups };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets the rosters for a league.
 * @param leagueId - The ID of the league.
 * @returns A list of rosters or an error.
 */
export async function getRosters(leagueId: string) {
  try {
    const { data: rosters, error } = await fetchJson<SleeperRoster[]>(
      `https://api.sleeper.app/v1/league/${leagueId}/rosters`
    );
    if (error) {
      return { error };
    }
    return { rosters };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets the users in a league.
 * @param leagueId - The ID of the league.
 * @returns A list of users or an error.
 */
export async function getUsersInLeague(leagueId: string) {
  try {
    const { data: users, error } = await fetchJson<SleeperUser[]>(
      `https://api.sleeper.app/v1/league/${leagueId}/users`
    );
    if (error) {
      return { error };
    }
    return { users };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets Sleeper's current NFL season/week state. `week` is scoped to
 * `season_type` (e.g. it counts preseason weeks during the preseason) —
 * gate on `season_type === 'regular'` before trusting it for regular-season
 * data.
 * @returns The current NFL state or an error.
 */
export async function getNflState() {
  try {
    // Unlike /projections and /stats, /v1/state/nfl is on the documented,
    // stable host (matches getCurrentNflWeek's existing fetch in actions.ts).
    const { data: state, error } = await fetchJson<SleeperNflState>(
      `https://api.sleeper.app/v1/state/nfl`
    );
    if (error) {
      return { error };
    }
    return { state };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets a league's scoring settings, used to score projections the same way
 * this league scores actual stats. Sleeper already applies this for live
 * `players_points`; projections have no such precomputed per-league value.
 * @param leagueId - The ID of the league.
 * @returns The league's scoring settings (a flat stat-key -> point-value
 * map) or an error.
 */
export async function getLeagueScoringSettings(leagueId: string) {
  try {
    const { data: league, error } = await fetchJson<SleeperLeague>(
      `https://api.sleeper.app/v1/league/${leagueId}`
    );
    if (error) {
      return { error };
    }
    return { scoringSettings: league?.scoring_settings ?? {} };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Validates a `/projections` or `/stats` payload before it is trusted.
 * Because these endpoints are undocumented, the dangerous failure mode is
 * not a crash but a silently renamed stat key, which would score every
 * player at 0.0 and render those zeroes as real numbers.
 *
 * An empty `/stats` response is normal — every unplayed week looks like
 * that. An empty `/projections` response is not: Sleeper always projects
 * an upcoming week, so an empty array there means the shape broke.
 */
function validateProjectionRows(
  rows: unknown,
  kind: 'projections' | 'stats'
): SleeperProjection[] {
  if (kind === 'stats' && Array.isArray(rows) && rows.length === 0) {
    return [];
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Sleeper ${kind} returned no rows — refusing to use it`);
  }

  const withStats = rows.filter(
    (row): row is SleeperProjection =>
      Boolean(row) && typeof row === 'object' && row.stats && typeof row.stats === 'object'
  );
  if (withStats.length === 0) {
    throw new Error(`Sleeper ${kind}: no row has a stats object — response shape changed`);
  }

  const seenKeys = new Set(withStats.flatMap((row) => Object.keys(row.stats ?? {})));
  if (!PROJECTION_SENTINEL_KEYS.some((key) => seenKeys.has(key))) {
    throw new Error(
      `Sleeper ${kind}: no expected stat keys found. Saw: ${[...seenKeys].slice(0, 20).join(', ')}`
    );
  }

  return rows as SleeperProjection[];
}

/**
 * Gets weekly player projections from Sleeper's undocumented (but open,
 * unauthenticated) `/projections` endpoint. The response is a flat array
 * covering Sleeper's whole player universe, most of whom are not actually
 * projected — filter to rows with a stat line to get just the players who
 * are playing.
 * @param season - The season year, e.g. "2025".
 * @param week - The week number.
 * @param positions - Positions to request; defaults to the standard
 * fantasy skill positions.
 * @returns A list of projection rows or an error.
 */
export async function getWeeklyProjections(
  season: string,
  week: number,
  positions: string[] = FANTASY_POSITIONS
) {
  try {
    const qs = new URLSearchParams({ season_type: 'regular' });
    for (const position of positions) {
      qs.append('position[]', position);
    }
    const url = `${SLEEPER_STATS_BASE}/projections/nfl/${season}/${week}?${qs}`;

    const { data: rows, error } = await fetchJson<unknown>(url);
    if (error) {
      return { error };
    }

    const projections = validateProjectionRows(rows, 'projections');
    return { projections };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred' };
  }
}

/**
 * Gets all NFL players from the Sleeper API.
 * @returns A list of NFL players or an error.
 */
export async function getNflPlayers() {
  try {
    const { data: players, error } = await fetchJson<Record<string, SleeperPlayer>>(
      `https://api.sleeper.app/v1/players/nfl`
    );
    if (error) {
      return { error };
    }
    return { players };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets the matchups for a league, including roster and user data.
 * @param leagueId - The ID of the league.
 * @param week - The week to get matchups for.
 * @returns A list of enriched matchups or an error.
 */
export async function getLeagueMatchups(leagueId: string, week: string) {
  try {
    const [matchupsRes, rostersRes, usersRes, playersRes] = await Promise.all([
      getMatchups(leagueId, week),
      getRosters(leagueId),
      getUsersInLeague(leagueId),
      getNflPlayers(),
    ]);

    if (matchupsRes.error) return { error: matchupsRes.error };
    if (rostersRes.error) return { error: rostersRes.error };
    if (usersRes.error) return { error: usersRes.error };
    if (playersRes.error) return { error: playersRes.error };

    const { matchups } = matchupsRes;
    const { rosters } = rostersRes;
    const { users } = usersRes;
    const { players } = playersRes;

    // The four calls above report failure through `error`, but a success with
    // an empty body would still leave these undefined — narrow before use.
    if (!matchups || !rosters || !users || !players) {
      return { error: 'Sleeper returned an incomplete matchup payload.' };
    }

    const usersMap = new Map(users.map((user) => [user.user_id, user]));
    const rostersMap = new Map(rosters.map((roster) => [roster.roster_id, roster]));

    const enrichedMatchups: SleeperEnrichedMatchup[] = matchups.map((matchup) => {
      const roster = rostersMap.get(matchup.roster_id);
      if (!roster) return matchup as unknown as SleeperEnrichedMatchup;

      const user = usersMap.get(roster.owner_id);
      const matchupPlayers = matchup.players.map((playerId: string) => {
        const playerDetails = players[playerId];
        return {
          player_id: playerId,
          first_name: playerDetails?.first_name || 'Unknown',
          last_name: playerDetails?.last_name || 'Player',
          position: playerDetails?.position || 'N/A',
          team: playerDetails?.team || 'N/A',
          score: matchup.players_points?.[playerId] ?? 0,
        };
      });

      const totalPoints = matchupPlayers.reduce(
        (acc: number, player: { score: number }) => acc + player.score,
        0
      );

      return {
        ...matchup,
        user: user ? { display_name: user.display_name, avatar: user.avatar } : { display_name: 'Unknown User' },
        players: matchupPlayers,
        total_points: totalPoints,
      };
    });

    return { matchups: enrichedMatchups };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching league matchups' };
  }
}
