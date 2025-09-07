'use server';

import { createClient } from '@/utils/supabase/server';

async function getYahooAccessToken(integrationId: number): Promise<{ access_token?: string; error?: string }> {
  const supabase = createClient();
  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('id', integrationId)
    .single();

  if (integrationError || !integration) {
    return { error: 'Yahoo integration not found.' };
  }

  // Check if the token is expired or close to expiring (e.g., within 60 seconds)
  if (integration.expires_at && new Date(integration.expires_at).getTime() < Date.now() + 60000) {
    // Token is expired, refresh it
    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;
    const redirectUri = process.env.YAHOO_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return { error: 'Yahoo client ID, secret, or redirect URI is not configured.' };
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
          redirect_uri: redirectUri,
          refresh_token: integration.refresh_token,
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
          refresh_token: data.refresh_token, // Yahoo may issue a new refresh token
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

  // First, delete all leagues associated with the integration
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
      const { data: insertedLeagues, error: insertError } = await supabase
        .from('leagues')
        .insert(leaguesToInsert)
        .select();

      if (insertError) {
        // This could be a unique constraint violation if leagues already exist, which is fine.
        // A more robust implementation would use .upsert()
        console.log('Could not insert leagues, they may already exist.', insertError.message);
        return { leagues: [] };
      }
      return { leagues: insertedLeagues };
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

  // The game_key for nfl is 'nfl'. This might need to be dynamic in the future.
  const gameKey = 'nfl';
  const teamKey = `${gameKey}.l.${leagueId}.t.${teamId}`;
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
    const roster = data.fantasy_content?.team?.[1]?.roster?.['0']?.players;

    if (!roster) {
      return { players: [] };
    }

    const players = Object.values(roster).filter((p: any) => p.player).map((p: any) => {
      const playerDetails = p.player[0];
      return {
        player_key: playerDetails[0].player_key,
        player_id: playerDetails[1].player_id,
        name: playerDetails[2].name.full,
        editorial_player_key: playerDetails[3].editorial_player_key,
        editorial_team_key: playerDetails[4].editorial_team_key,
        editorial_team_full_name: playerDetails[5].editorial_team_full_name,
        editorial_team_abbr: playerDetails[6].editorial_team_abbr,
        bye_weeks: playerDetails[7].bye_weeks.week,
        uniform_number: playerDetails[8].uniform_number,
        display_position: playerDetails[9].display_position,
        headshot: playerDetails[10].headshot.url,
        image_url: playerDetails[11].image_url,
        is_undroppable: playerDetails[12].is_undroppable,
        position_type: playerDetails[13].position_type,
        eligible_positions: playerDetails[14].eligible_positions.map((pos: any) => pos.position),
      };
    });

    return { players };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching the roster from Yahoo.' };
  }
}
