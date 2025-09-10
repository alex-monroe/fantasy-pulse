'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getCurrentNflWeek } from '@/app/actions';

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

async function getYahooAccessToken(integrationId: number): Promise<{ access_token?: string; error?: string }> {
  const supabase = createClient();
  console.log(`Fetching access token for integrationId: ${integrationId}`);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('Authentication error: No user found.');
    return { error: 'User not authenticated.' };
  }

  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('id', integrationId)
    .eq('user_id', user.id)
    .single();

  if (integrationError) {
    console.error('Error fetching integration from Supabase:', integrationError);
    return { error: `Error fetching integration: ${integrationError.message}` };
  }

  if (!integration) {
    console.error(`Integration not found for id: ${integrationId} and user_id: ${user.id}`);
    return { error: 'Yahoo integration not found.' };
  }

  // Check if the token is expired or close to expiring (e.g., within 60 seconds)
  if (integration.expires_at && new Date(integration.expires_at).getTime() < Date.now() + 60000) {
    // Token is expired, refresh it
    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;
    const redirectUri = process.env.YAHOO_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      const missingVars = [];
      if (!clientId) missingVars.push('YAHOO_CLIENT_ID');
      if (!clientSecret) missingVars.push('YAHOO_CLIENT_SECRET');
      if (!redirectUri) missingVars.push('YAHOO_REDIRECT_URI');
      return { error: `Yahoo integration is not configured. Missing environment variables: ${missingVars.join(', ')}` };
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          redirect_uri: process.env.YAHOO_REDIRECT_URI!,
          refresh_token: integration.refresh_token!,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Yahoo token refresh error:', data);
        return { error: `Failed to refresh Yahoo token: ${data.error_description || response.statusText}` };
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

export async function connectYahoo() {
  // This function is deprecated. The OAuth flow handles the connection.
  return { success: true };
}

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

export async function getYahooUserTeams(integrationId: number) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);
  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const url = 'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/teams?format=json';

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Yahoo API Error fetching teams: ${response.status} ${response.statusText}`, errorBody);
      return { error: `Failed to fetch teams from Yahoo: ${response.statusText}` };
    }

    const data = await response.json();
    console.log('Yahoo API response for teams:', JSON.stringify(data, null, 2));
    const teamsFromYahoo = data.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.teams;

    if (!teamsFromYahoo) {
      console.log('No teams found in Yahoo API response.');
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
        console.error('Could not upsert teams.', upsertError.message);
        return { error: `Failed to save teams to database: ${upsertError.message}` };
      }
      return { teams: upsertedTeams };
    }

    return { teams: [] };
  } catch (error) {
    console.error('An unexpected error occurred while fetching teams from Yahoo.', error);
    return { error: 'An unexpected error occurred while fetching teams from Yahoo.' };
  }
}

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

export async function getYahooLeagues(integrationId: number) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);

  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const url = 'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json';

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Yahoo API Error: ${response.status} ${response.statusText}`, errorBody);
      return { error: `Failed to fetch leagues from Yahoo: ${response.statusText}` };
    }

    const data = await response.json();
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
        console.error('Could not upsert leagues.', upsertError.message);
        return { error: `Failed to save leagues to database: ${upsertError.message}` };
      }
      return { leagues: upsertedLeagues };
    }

    return { leagues: [] };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching leagues from Yahoo.' };
  }
}

export async function getYahooRoster(integrationId: number, leagueId: string, teamId: string) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);

  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const teamKey = `${leagueId}.t.${teamId}`;
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/roster/players?format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Yahoo API Error: ${response.status} ${response.statusText}`, errorBody);
      return { error: `Failed to fetch roster from Yahoo: ${response.statusText}` };
    }

    const data = await response.json();
    const rosterData = data.fantasy_content?.team?.[1]?.roster?.['0']?.players;

    // Log the raw roster data for debugging
    // console.log('Yahoo roster data:', JSON.stringify(rosterData, null, 2));

    if (!rosterData) {
      console.log('No roster data found in Yahoo API response.');
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

export async function getYahooMatchups(integrationId: number, teamKey: string) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);
  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const week = await getCurrentNflWeek();
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/matchups;weeks=${week}?format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Yahoo API Error fetching matchups: ${response.status} ${response.statusText}`, errorBody);
      return { error: `Failed to fetch matchups from Yahoo: ${response.statusText}` };
    }

    const data = await response.json();
    const matchupsData = data.fantasy_content?.team?.[1]?.matchups?.['0']?.matchup;

    if (!matchupsData) {
      console.log('No matchups found in Yahoo API response.');
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
    console.error('An unexpected error occurred while fetching matchups from Yahoo.', error);
    return { error: 'An unexpected error occurred while fetching matchups from Yahoo.' };
  }
}

export async function getYahooPlayerScores(integrationId: number, teamKey: string) {
  const { access_token, error: tokenError } = await getYahooAccessToken(integrationId);
  if (tokenError || !access_token) {
    return { error: tokenError || 'Failed to get Yahoo access token.' };
  }

  const week = await getCurrentNflWeek();
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/roster;week=${week}/players/stats?format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Yahoo API Error: ${response.status} ${response.statusText}`, errorBody);
      return { error: `Failed to fetch player scores from Yahoo: ${response.statusText}` };
    }

    const data = await response.json();
    // console.log('Yahoo player scores data:', JSON.stringify(data, null, 2));
    const rosterData = data.fantasy_content?.team?.[1]?.roster?.['0']?.players;

    if (!rosterData) {
      console.log('No roster data found in Yahoo API response.');
      return { players: [] };
    }

    const players = Object.values(rosterData).filter((p: any) => p.player).map((p: any) => {
      const playerDetailsArray = p.player[0];
      const playerStats = p.player[1]?.player_points?.total;

      const playerDetails: { [key: string]: any } = {};
      playerDetailsArray.forEach((detail: any) => {
        if (detail) {
          const key = Object.keys(detail)[0];
          playerDetails[key] = detail[key];
        }
      });

      return {
        player_key: playerDetails.player_key,
        player_id: playerDetails.player_id,
        name: playerDetails.name?.full,
        headshot: playerDetails.headshot?.url,
        position_type: playerDetails.position_type,
        totalPoints: playerStats,
      };
    }).filter(Boolean);

    return { players };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching player scores from Yahoo.' };
  }
}
