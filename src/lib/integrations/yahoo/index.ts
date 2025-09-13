import { Provider } from '../provider';
import { League, UserIntegration } from '@/lib/types';
import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/logger';

export class YahooProvider implements Provider {
  public async connect(code: string): Promise<{ user?: any; error?: string }> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'You must be logged in to connect your Yahoo account.' };
    }

    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;
    const redirectUri = process.env.YAHOO_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return { error: 'Yahoo integration is not configured.' };
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
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code: code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: `Failed to fetch Yahoo token: ${data.error_description || response.statusText}` };
      }

      const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();

      const { error: insertError } = await supabase
        .from('user_integrations')
        .insert({
          user_id: user.id,
          provider: 'yahoo',
          provider_user_id: data.xoauth_yahoo_guid,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: expires_at,
        });

      if (insertError) {
        return { error: insertError.message };
      }

      return { user: { provider_user_id: data.xoauth_yahoo_guid } };
    } catch (error) {
      return { error: 'An unexpected error occurred' };
    }
  }

  public async remove(integrationId: number): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient();

    const { error: deleteLeaguesError } = await supabase
      .from('leagues')
      .delete()
      .eq('user_integration_id', integrationId);

    if (deleteLeaguesError) {
      return { success: false, error: `Failed to delete leagues: ${deleteLeaguesError.message}` };
    }

    const { error: deleteIntegrationError } = await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integrationId);

    if (deleteIntegrationError) {
      return { success: false, error: `Failed to delete integration: ${deleteIntegrationError.message}` };
    }

    return { success: true };
  }

  public async getLeagues(integrationId: number): Promise<{ leagues?: League[]; error?: string }> {
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

  public async getIntegration(): Promise<{ integration?: UserIntegration; error?: string }> {
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

    if (error && error.code !== 'PGRST116') {
      return { error: error.message };
    }

    return { integration: data };
  }

  public async syncData(integration: UserIntegration): Promise<{ success: boolean; error?: string }> {
    const { access_token, error: tokenError } = await this.getRefreshedAccessToken(integration);
    if (tokenError) {
      return { success: false, error: tokenError };
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
        logger.error(
          { status: response.status, statusText: response.statusText, errorBody },
          'Yahoo API Error'
        );
        return { success: false, error: `Failed to fetch leagues from Yahoo: ${response.statusText}` };
      }

      const data = await response.json();
      const leaguesFromYahoo = data.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues;

      if (leaguesFromYahoo) {
        const leaguesToInsert = Object.values(leaguesFromYahoo).filter((l: any) => l.league).map((l: any) => ({
          user_integration_id: integration.id,
          league_id: l.league[0].league_key,
          name: l.league[0].name,
          season: l.league[0].season,
          total_rosters: l.league[0].num_teams,
          status: l.league[0].status,
          user_id: integration.user_id,
        }));

        if (leaguesToInsert.length > 0) {
          const supabase = createClient();
          const { error: upsertError } = await supabase
            .from('leagues')
            .upsert(leaguesToInsert, { onConflict: 'league_id' });

          if (upsertError) {
            logger.error(upsertError, 'Could not upsert leagues.');
            return { success: false, error: `Failed to save leagues to database: ${upsertError.message}` };
          }
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred while fetching leagues from Yahoo.' };
    }
  }

  private async getRefreshedAccessToken(integration: UserIntegration): Promise<{ access_token?: string; error?: string }> {
    if (integration.expires_at && new Date(integration.expires_at).getTime() < Date.now() + 60000) {
      const clientId = process.env.YAHOO_CLIENT_ID;
      const clientSecret = process.env.YAHOO_CLIENT_SECRET;
      const redirectUri = process.env.YAHOO_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        return { error: 'Yahoo integration is not configured.' };
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
            refresh_token: integration.refresh_token!,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          return { error: `Failed to refresh Yahoo token: ${data.error_description || response.statusText}` };
        }

        const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
        const supabase = createClient();
        const { error: updateError } = await supabase
          .from('user_integrations')
          .update({
            access_token: data.access_token,
            refresh_token: data.refresh_token || integration.refresh_token,
            expires_at: newExpiresAt,
          })
          .eq('id', integration.id);

        if (updateError) {
          return { error: `Failed to update new token in database: ${updateError.message}` };
        }

        return { access_token: data.access_token };
      } catch (error) {
        return { error: 'An unexpected error occurred while refreshing the Yahoo token.' };
      }
    }

    return { access_token: integration.access_token };
  }

  public async getTeams(integration: UserIntegration, week: number): Promise<{ teams?: any[]; error?: string }> {
    const { teams: yahooApiTeams, error: teamsError } = await this.getYahooUserTeams(integration.id);
    if (teamsError || !yahooApiTeams) {
      return { error: 'Could not fetch teams for yahoo' };
    }

    const teams = [];
    for (const team of yahooApiTeams) {
      const { matchups, error: matchupsError } = await this.getYahooMatchups(integration.id, team.team_key, week);
      if (matchupsError || !matchups) {
        continue;
      }

      const { userTeam, opponentTeam } = matchups;

      const { players: userPlayers, error: userRosterError } = await this.getYahooRoster(
        integration.id,
        team.league_id,
        userTeam.team_id
      );
      if (userRosterError || !userPlayers) continue;

      const { players: opponentPlayers, error: opponentRosterError } = await this.getYahooRoster(
        integration.id,
        team.league_id,
        opponentTeam.team_id
      );
      if (opponentRosterError || !opponentPlayers) continue;

      const { players: userPlayerScores, error: userScoresError } = await this.getYahooPlayerScores(
        integration.id,
        userTeam.team_key
      );
      if (userScoresError) {
        console.error(`Could not fetch user player scores for team ${userTeam.team_key}`, userScoresError);
      }

      const { players: opponentPlayerScores, error: opponentScoresError } = await this.getYahooPlayerScores(
        integration.id,
        opponentTeam.team_key
      );
      if (opponentScoresError) {
        console.error(
          `Could not fetch opponent player scores for team ${opponentTeam.team_key}`,
          opponentScoresError
        );
      }

      const userScoresMap = new Map(userPlayerScores?.map((p: any) => [p.player_key, p.totalPoints]));
      const opponentScoresMap = new Map(opponentPlayerScores?.map((p: any) => [p.player_key, p.totalPoints]));

      const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
      const playersData = await playersResponse.json();
      const playerNameMap: { [key: string]: string } = {};
      for (const playerId in playersData) {
        const player = playersData[playerId];
        if (player.full_name) {
          playerNameMap[player.full_name.toLowerCase()] = playerId;
        }
      }

      const mapYahooPlayer = (p: any, scoresMap: Map<string, number>) => {
        const sleeperId = playerNameMap[p.name.toLowerCase()];
        const imageUrl = sleeperId
          ? `https://sleepercdn.com/content/nfl/players/thumb/${sleeperId}.jpg`
          : p.headshot;

        return {
          id: p.player_key,
          name: p.name,
          position: p.display_position,
          realTeam: p.editorial_team_abbr,
          score: scoresMap.get(p.player_key) || 0,
          gameStatus: 'pregame',
          onUserTeams: 0,
          onOpponentTeams: 0,
          gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
          imageUrl: imageUrl,
          on_bench: p.on_bench,
        };
      };

      const mappedUserPlayers = userPlayers.map(p => mapYahooPlayer(p, userScoresMap));
      const mappedOpponentPlayers = opponentPlayers.map(p => mapYahooPlayer(p, opponentScoresMap));

      teams.push({
        id: team.id,
        name: userTeam.name,
        totalScore: parseFloat(userTeam.totalPoints) || 0,
        players: mappedUserPlayers,
        opponent: {
          name: opponentTeam.name,
          totalScore: parseFloat(opponentTeam.totalPoints) || 0,
          players: mappedOpponentPlayers,
        },
      });
    }
    return { teams };
  }

  private async getYahooUserTeams(integrationId: number) {
    const { access_token, error: tokenError } = await this.getRefreshedAccessToken({ id: integrationId } as UserIntegration);
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
        logger.error(
          { status: response.status, statusText: response.statusText, errorBody },
          'Yahoo API Error fetching teams'
        );
        return { error: `Failed to fetch teams from Yahoo: ${response.statusText}` };
      }

      const data = await response.json();
      logger.debug({ data }, 'Yahoo API response for teams');
      const teamsFromYahoo = data.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.teams;

      if (!teamsFromYahoo) {
        logger.info('No teams found in Yahoo API response.');
        return { teams: [] };
      }

      const teamsToInsert = Object.values(teamsFromYahoo).filter((t: any) => t.team).map((t: any) => {
        const teamDetails = this.parseYahooTeamData(t.team[0]);

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

  private async getYahooMatchups(integrationId: number, teamKey: string, week: number) {
    const { access_token, error: tokenError } = await this.getRefreshedAccessToken({ id: integrationId } as UserIntegration);
    if (tokenError || !access_token) {
      return { error: tokenError || 'Failed to get Yahoo access token.' };
    }

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
        logger.error(
          { status: response.status, statusText: response.statusText, errorBody },
          'Yahoo API Error fetching matchups'
        );
        return { error: `Failed to fetch matchups from Yahoo: ${response.statusText}` };
      }

      const data = await response.json();
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

      const parsedUserTeam = this.parseYahooTeamData(userTeamData.team[0]);
      const parsedOpponentTeam = this.parseYahooTeamData(opponentTeamData.team[0]);

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

  private async getYahooRoster(integrationId: number, leagueId: string, teamId: string) {
    const { access_token, error: tokenError } = await this.getRefreshedAccessToken({ id: integrationId } as UserIntegration);

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
        logger.error(
          { status: response.status, statusText: response.statusText, errorBody },
          'Yahoo API Error'
        );
        return { error: `Failed to fetch roster from Yahoo: ${response.statusText}` };
      }

      const data = await response.json();
      const rosterData = data.fantasy_content?.team?.[1]?.roster?.['0']?.players;

      if (!rosterData) {
        logger.info('No roster data found in Yahoo API response.');
        return { players: [] };
      }

      const players = Object.values(rosterData).filter((p: any) => p.player).map((p: any) => {
        const playerDetailsArray = p.player?.[0];
        const playerInfo = p.player?.[1];
        if (!playerDetailsArray || !playerInfo) return null;

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
      }).filter(Boolean);

      return { players };
    } catch (error) {
      return { error: 'An unexpected error occurred while fetching the roster from Yahoo.' };
    }
  }

  private async getYahooPlayerScores(integrationId: number, teamKey: string) {
    const { access_token, error: tokenError } = await this.getRefreshedAccessToken({ id: integrationId } as UserIntegration);
    if (tokenError || !access_token) {
      return { error: tokenError || 'Failed to get Yahoo access token.' };
    }

    const week = new Date().getFullYear();
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
        logger.error(
          { status: response.status, statusText: response.statusText, errorBody },
          'Yahoo API Error'
        );
        return { error: `Failed to fetch player scores from Yahoo: ${response.statusText}` };
      }

      const data = await response.json();
      const rosterData = data.fantasy_content?.team?.[1]?.roster?.['0']?.players;

      if (!rosterData) {
        logger.info('No roster data found in Yahoo API response.');
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

  private parseYahooTeamData(teamData: any[]) {
    const teamDetails: { [key: string]: any } = {};
    teamData.forEach((detail: any) => {
      if (detail) {
        const key = Object.keys(detail)[0];
        teamDetails[key] = detail[key];
      }
    });
    return teamDetails;
  }
}
