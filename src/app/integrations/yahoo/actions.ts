'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getCurrentNflWeek } from '@/app/actions';
import logger from '@/utils/logger';
import { fetchJson } from '@/lib/fetch-json';
import { getEnv } from '@/lib/env';

/**
 * Parses the team data from the Yahoo API response.
 * @param teamData - The team data from the Yahoo API response.
 * @returns The parsed team data.
 */
function parseYahooTeamData(teamData: any[]) {
  const teamDetails: { [key: string]: any } = {};
  teamData.forEach((detail: any) => {
    if (detail) {
      const key = Object.keys(detail)[0];
      teamDetails[key] = detail[key];
    }
  });
  return teamDetails;
}

/**
 * Gets the Yahoo access token for an integration.
 * @param integrationId - The ID of the integration.
 * @returns The access token or an error.
 */
export async function getYahooAccessToken(integrationId: number): Promise<{ access_token?: string; error?: string }> {
  const supabase = createClient();
  logger.info(`Fetching access token for integrationId: ${integrationId}`);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    logger.error('Authentication error: No user found.');
    return { error: 'User not authenticated.' };
  }

  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('id', integrationId)
    .eq('user_id', user.id)
    .single();

  if (integrationError) {
    logger.error({ integrationError }, 'Error fetching integration from Supabase');
    return { error: `Error fetching integration: ${integrationError.message}` };
  }

  if (!integration) {
    logger.error(`Integration not found for id: ${integrationId} and user_id: ${user.id}`);
    return { error: 'Yahoo integration not found.' };
  }

  // Check if the token is expired or close to expiring (e.g., within 60 seconds)
  if (integration.expires_at && new Date(integration.expires_at).getTime() < Date.now() + 60000) {
    // Token is expired, refresh it
    const { YAHOO_CLIENT_ID: clientId, YAHOO_CLIENT_SECRET: clientSecret, YAHOO_REDIRECT_URI: redirectUri } = getEnv();

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const { data, error } = await fetchJson<any>('https://api.login.yahoo.com/oauth2/get_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          redirect_uri: redirectUri,
          refresh_token: integration.refresh_token!,
        }),
      });

      if (error || !data) {
        logger.error({ error }, 'Yahoo token refresh error');
        return { error: `Failed to refresh Yahoo token: ${error}` };
      }

      const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

      const { error: updateError } = await supabase
        .from('user_integrations')
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token || integration.refresh_token, // Yahoo may issue a new refresh token
          expires_at: newExpiresAt,
        })
        .eq('id', integrationId);

      if (updateError) {
        return { error: `Failed to update new token in database: ${updateError.message}` };
      }

      return { access_token: data.access_token };
    } catch (error) {
      return { error: 'An unexpected error occurred while refreshing the Yahoo token.' };
    }
  }

  // Token is still valid
  return { access_token: integration.access_token };
}

/**
 * Connects a Yahoo account to the user's account.
 * @deprecated The OAuth flow handles the connection.
 * @returns A success message.
 */
export async function connectYahoo() {
  // This function is deprecated. The OAuth flow handles the connection.
  return { success: true };
}

/**
 * Removes a Yahoo integration from the user's account.
 * @param integrationId - The ID of the integration to remove.
 * @returns A success message or an error.
 */
export async function removeYahooIntegration(integrationId: number) {
  const supabase = createClient();

  // First, delete all teams associated with the integration
  const { error: deleteTeamsError } = await supabase
    .from('teams')
    .delete()
    .eq('user_integration_id', integrationId);

  if (deleteTeamsError) {
    return { error: `Failed to delete teams: ${deleteTeamsError.message}` };
  }

  // Then, delete all leagues associated with the integration
  const { error: deleteLeaguesError } = await supabase
    .from('leagues')
    .delete()
    .eq('user_integration_id', integrationId);

  if (deleteLeaguesError) {
    return { error: `Failed to delete leagues: ${deleteLeaguesError.message}` };
  }

  // Then, delete the integration itself
  const { error: deleteIntegrationError } = await supabase
    .from('user_integrations')
    .delete()
    .eq('id', integrationId);

  if (deleteIntegrationError) {
    return { error: `Failed to delete integration: ${deleteIntegrationError.message}` };
  }

  return { success: true };
}

/**
 * Gets the leagues for a Yahoo integration.
 * @param integrationId - The ID of the integration.
 * @returns A list of leagues or an error.
 */
export async function getLeagues(integrationId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('user_integration_id', integrationId);

  if (error) {
    return { error: error.message };
  }

  return { leagues: data };
}

/**
 * Gets the teams for a Yahoo integration.
 * @param integrationId - The ID of the integration.
 * @returns A list of teams or an error.
 */
export async function getTeams(integrationId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('user_integration_id', integrationId);

  if (error) {
    return { error: error.message };
  }

  return { teams: data };
}

/**
 * Gets the user's teams from the Yahoo API and saves them to the database.
 * The API returns a deeply nested object. The teams are in the
 * fantasy_content.users[0].user[1].games[0].game[1].teams object.
 * The teams object is a collection of team objects, where each key is a number.
 * {
 *   "fantasy_content": {
 *     "users": [
 *       {
 *         "user": [
 *           {},
 *           {
 *             "games": [
 *               {
 *                 "game": [
 *                   {},
 *                   {
 *                     "teams": {
 *                       "0": { "team": [...] },
 *                       "1": { "team": [...] },
 *                       "count": 2
 *                     }
 *                   }
 *                 ]
 *               }
 *             ]
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * }
 * @param integrationId - The ID of the integration.
 * @returns A list of teams or an error.
 */
export async function getYahooUserTeams(integrationId: number) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);
  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const url = 'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/teams?format=json';

  try {
    const { data, error } = await fetchJson<any>(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (error) {
      logger.error({ error }, 'Yahoo API Error fetching teams');
      return { error: `Failed to fetch teams from Yahoo: ${error}` };
    }
    logger.debug({ data }, 'Yahoo API response for teams');
    const teamsFromYahoo = data.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.teams;

    if (!teamsFromYahoo) {
      logger.info('No teams found in Yahoo API response.');
      return { teams: [] };
    }

    const teamsToInsert = Object.values(teamsFromYahoo).filter((t: any) => t.team).map((t: any) => {
      const teamDetails = parseYahooTeamData(t.team[0]);

      return {
        user_integration_id: integrationId,
        team_key: teamDetails.team_key,
        team_id: teamDetails.team_id,
        name: teamDetails.name,
        logo_url: teamDetails.team_logos?.[0]?.team_logo?.url,
        league_id: teamDetails.team_key.split('.').slice(0, 3).join('.'),
      };
    });

    if (teamsToInsert.length > 0) {
      const supabase = createClient();
      const { data: upsertedTeams, error: upsertError } = await supabase
        .from('teams')
        .upsert(teamsToInsert, { onConflict: 'team_key,user_integration_id' })
        .select();

      if (upsertError) {
        logger.error(upsertError, 'Could not upsert teams.');
        return { error: `Failed to save teams to database: ${upsertError.message}` };
      }
      return { teams: upsertedTeams };
    }

    return { teams: [] };
  } catch (error) {
    logger.error(error, 'An unexpected error occurred while fetching teams from Yahoo.');
    return { error: 'An unexpected error occurred while fetching teams from Yahoo.' };
  }
}

/**
 * Gets the Yahoo integration for the current user.
 * @returns The Yahoo integration or an error.
 */
export async function getYahooIntegration() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'yahoo')
    .single();

  if (error && error.code !== 'PGRST116') { // ignore no rows found error
    return { error: error.message };
  }

  return { integration: data };
}

/**
 * Gets the user's leagues from the Yahoo API and saves them to the database.
 * The response from the Yahoo API is structured as follows:
 * {
 *   fantasy_content: {
 *     users: [
 *       {
 *         user: [
 *           {},
 *           {
 *             games: [
 *               {
 *                 game: [
 *                   {},
 *                   {
 *                     leagues: {
 *                       "0": { league: [...] },
 *                       "1": { league: [...] },
 *                       count: 2
 *                     }
 *                   }
 *                 ]
 *               }
 *             ]
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * }
 * @param integrationId - The ID of the integration.
 * @returns A list of leagues or an error.
 */
export async function getYahooLeagues(integrationId: number) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);

  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const url = 'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json';

  try {
    const { data, error } = await fetchJson<any>(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (error) {
      logger.error({ error }, 'Yahoo API Error fetching leagues');
      return { error: `Failed to fetch leagues from Yahoo: ${error}` };
    }
    const leaguesFromYahoo = data.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues;

    if (!leaguesFromYahoo) {
      return { leagues: [] };
    }

    const leaguesToInsert = Object.values(leaguesFromYahoo).filter((l: any) => l.league).map((l: any) => ({
      user_integration_id: integrationId,
      league_id: l.league[0].league_key,
      name: l.league[0].name,
      season: l.league[0].season,
      total_rosters: l.league[0].num_teams,
      status: l.league[0].status,
    }));

    if (leaguesToInsert.length > 0) {
      const supabase = createClient();
      const { data: upsertedLeagues, error: upsertError } = await supabase
        .from('leagues')
        .upsert(leaguesToInsert, { onConflict: 'league_id' })
        .select();

      if (upsertError) {
        logger.error(upsertError, 'Could not upsert leagues.');
        return { error: `Failed to save leagues to database: ${upsertError.message}` };
      }
      return { leagues: upsertedLeagues };
    }

    return { leagues: [] };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching leagues from Yahoo.' };
  }
}

/**
 * Gets the roster for a team from the Yahoo API.
 * The API returns a deeply nested object. In most responses, the roster is in
 * the `fantasy_content.team[1].roster['0'].players` object, though some
 * responses may expose the roster at `fantasy_content.roster['0'].players`.
 * The players object is a collection of player objects, where each key is a number.
 * {
 *   "fantasy_content": {
 *     "team": [
 *       [...],
 *       {
 *         "roster": {
 *           "0": {
 *             "players": {
 *               "0": { "player": [...] },
 *               "1": { "player": [...] },
 *               "count": 2
 *             }
 *           }
 *         }
 *       }
 *     ]
 *   }
 * }
 * @param integrationId - The ID of the integration.
 * @param leagueId - The ID of the league.
 * @param teamId - The ID of the team.
 * @returns A list of players or an error.
 */
export async function getYahooRoster(integrationId: number, leagueId: string, teamId: string) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);

  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const teamKey = `${leagueId}.t.${teamId}`;
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/roster/players?format=json`;

  try {
    const { data, error } = await fetchJson<any>(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (error) {
      logger.error({ error }, 'Yahoo API Error');
      return { error: `Failed to fetch roster from Yahoo: ${error}` };
    }
    // Yahoo's roster response typically nests player data under
    // `fantasy_content.team[1].roster['0'].players`. Some examples (such as
    // the official API docs) also show the roster available directly under
    // `fantasy_content.roster`. Handle both structures to avoid returning an
    // empty list when the nesting differs.
    const rosterData =
      data.fantasy_content?.team?.[1]?.roster?.['0']?.players ??
      data.fantasy_content?.roster?.['0']?.players;

    if (!rosterData) {
      logger.info('No roster data found in Yahoo API response.');
      return { players: [] };
    }

    const players = Object.values(rosterData).filter((p: any) => p.player).map((p: any) => {
      const playerDetailsArray = p.player?.[0];
      const playerInfo = p.player?.[1];
      if (!playerDetailsArray || !playerInfo) return null;

      // Convert array to a more readable object
      const playerDetails: { [key: string]: any } = {};
      playerDetailsArray.forEach((detail: any) => {
        const key = Object.keys(detail)[0];
        playerDetails[key] = detail[key];
      });

      const selectedPosition = playerInfo.selected_position?.[1]?.position;

      return {
        player_key: playerDetails.player_key,
        player_id: playerDetails.player_id,
        name: playerDetails.name?.full,
        editorial_player_key: playerDetails.editorial_player_key,
        editorial_team_key: playerDetails.editorial_team_key,
        editorial_team_full_name: playerDetails.editorial_team_full_name,
        editorial_team_abbr: playerDetails.editorial_team_abbr,
        bye_weeks: playerDetails.bye_weeks?.week,
        uniform_number: playerDetails.uniform_number,
        display_position: playerDetails.display_position,
        headshot: playerDetails.headshot?.url,
        image_url: playerDetails.image_url,
        is_undroppable: playerDetails.is_undroppable,
        position_type: playerDetails.position_type,
        eligible_positions: playerDetails.eligible_positions?.map((pos: any) => pos.position),
        on_bench: selectedPosition === 'BN',
      };
    }).filter(Boolean); // Filter out any null entries from failed parsing

    return { players };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching the roster from Yahoo.' };
  }
}

/**
 * Gets the matchups for a team from the Yahoo API.
 * @param integrationId - The ID of the integration.
 * @param teamKey - The key of the team.
 * @returns The matchup for the team or an error.
 */
export async function getYahooMatchups(integrationId: number, teamKey: string) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);
  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const week = await getCurrentNflWeek();
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/matchups;weeks=${week}?format=json`;

  try {
    const { data, error } = await fetchJson<any>(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (error) {
      logger.error({ error }, 'Yahoo API Error fetching matchups');
      return { error: `Failed to fetch matchups from Yahoo: ${error}` };
    }
    const matchupsData = data.fantasy_content?.team?.[1]?.matchups?.['0']?.matchup;

    if (!matchupsData) {
      logger.info('No matchups found in Yahoo API response.');
      return { matchups: null };
    }

    const teams = matchupsData['0'].teams;
    const userTeamData = Object.values(teams).find((t: any) => t.team[0][0].team_key === teamKey) as any;
    const opponentTeamData = Object.values(teams).find((t: any) => t.team[0][0].team_key !== teamKey) as any;

    if (!userTeamData || !opponentTeamData) {
      return { matchups: null };
    }

    const parsedUserTeam = parseYahooTeamData(userTeamData.team[0]);
    const parsedOpponentTeam = parseYahooTeamData(opponentTeamData.team[0]);

    const matchup = {
      userTeam: {
        team_key: parsedUserTeam.team_key,
        team_id: parsedUserTeam.team_id,
        name: parsedUserTeam.name,
        logo_url: parsedUserTeam.team_logos?.[0]?.team_logo?.url,
        totalPoints: userTeamData.team[1]?.team_points?.total,
      },
      opponentTeam: {
        team_key: parsedOpponentTeam.team_key,
        team_id: parsedOpponentTeam.team_id,
        name: parsedOpponentTeam.name,
        logo_url: parsedOpponentTeam.team_logos?.[0]?.team_logo?.url,
        totalPoints: opponentTeamData.team[1]?.team_points?.total,
      },
    };

    return { matchups: matchup };
  } catch (error) {
    logger.error(error, 'An unexpected error occurred while fetching matchups from Yahoo.');
    return { error: 'An unexpected error occurred while fetching matchups from Yahoo.' };
  }
}

/**
 * Gets the player scores for a team from the Yahoo API.
 * @param integrationId - The ID of the integration.
 * @param teamKey - The key of the team.
 * @returns A list of player scores or an error.
 */
export async function getYahooPlayerScores(integrationId: number, teamKey: string) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);
  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const week = await getCurrentNflWeek();
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/roster;week=${week}/players/stats?format=json`;

  try {
    const { data, error } = await fetchJson<any>(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (error) {
      logger.error({ error }, 'Yahoo API Error');
      return { error: `Failed to fetch player scores from Yahoo: ${error}` };
    }
    // Similar to the basic roster endpoint, player stats can be nested in two
    // different ways depending on the Yahoo API response. Prefer the
    // `team[1].roster` structure but fall back to a top-level `roster` key if
    // present.
    const rosterDataRoot =
      data.fantasy_content?.team?.[1]?.roster ??
      data.fantasy_content?.roster;

    if (!rosterDataRoot) {
      logger.info('No roster data found in Yahoo API response.');
      return { players: [] };
    }

    // Flatten the roster structure into a simple array of player entries.
    const rosterEntries: any[] = [];
    Object.values(rosterDataRoot).forEach((entry: any) => {
      if (entry?.player) {
        rosterEntries.push(entry);
      } else if (entry?.players) {
        Object.values(entry.players).forEach((p: any) => {
          if (p?.player) {
            rosterEntries.push(p);
          }
        });
      }
    });

    const players = rosterEntries
      .map((p: any) => {
        // `p.player` is an array whose first element contains an array of
        // player details. The remaining elements include selected_position,
        // player_stats, player_points, etc. We need to flatten the details
        // array and then extract the points separately.
        const playerInfo = p.player;
        const detailsArray = playerInfo[0];
        const playerDetails = parseYahooTeamData(detailsArray);
        const pointsEntry = playerInfo.find((d: any) => d.player_points);

        return {
          player_key: playerDetails.player_key,
          player_id: playerDetails.player_id,
          name: playerDetails.name?.full,
          headshot: playerDetails.headshot?.url,
          position_type: playerDetails.position_type,
          totalPoints: pointsEntry?.player_points?.total,
        };
      })
      .filter(Boolean);

    return { players };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching player scores from Yahoo.' };
  }
}
