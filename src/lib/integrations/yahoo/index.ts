import { FantasyFootballProvider, ProviderLeague } from '../types';
import { Team, Player } from '@/lib/types';
import { createClient } from '@/utils/supabase/server';

// Type definitions for Yahoo API responses
interface YahooPlayer {
  player_key: string;
  name: { full: string };
  display_position: string;
  editorial_team_abbr: string;
  headshot: { url: string };
  is_on_bench: boolean;
}

interface YahooTeam {
  team_key: string;
  name: string;
  team_logos: { team_logo: { url: string } }[];
  league_key: string;
}

interface YahooMatchupTeam {
  team_key: string;
  team_id: string;
  name: string;
  totalPoints: string;
}

interface YahooMatchup {
  userTeam: YahooMatchupTeam;
  opponentTeam: YahooMatchupTeam;
}

interface YahooPlayerScore {
  player_key: string;
  totalPoints: number;
}

async function getCurrentNflWeek() {
  const nflStateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
  const nflState = await nflStateResponse.json();
  return nflState.week;
}

async function getSleeperPlayers() {
  const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
  const playersData = await playersResponse.json();
  const playerNameMap: { [key: string]: string } = {};
  for (const playerId in playersData) {
    const player = playersData[playerId];
    if (player.full_name) {
      playerNameMap[player.full_name.toLowerCase()] = playerId;
    }
  }
  return playerNameMap;
}

async function getYahooAccessToken(integrationId: number): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated.');

  const { data: integration } = await supabase.from('user_integrations').select('access_token, refresh_token, expires_at').eq('id', integrationId).eq('user_id', user.id).single();
  if (!integration) throw new Error('Yahoo integration not found.');

  if (integration.expires_at && new Date(integration.expires_at).getTime() < Date.now() + 60000) {
    const { YAHOO_CLIENT_ID: clientId, YAHOO_CLIENT_SECRET: clientSecret, YAHOO_REDIRECT_URI: redirectUri } = process.env;
    if (!clientId || !clientSecret || !redirectUri) throw new Error('Yahoo integration is not configured.');

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', redirect_uri: redirectUri, refresh_token: integration.refresh_token! }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Failed to refresh Yahoo token: ${data.error_description || response.statusText}`);

    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await supabase.from('user_integrations').update({ access_token: data.access_token, refresh_token: data.refresh_token || integration.refresh_token, expires_at: newExpiresAt }).eq('id', integrationId);
    return data.access_token;
  }
  return integration.access_token!;
}

async function yahooApiFetch(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Yahoo API Error: ${response.status} ${response.statusText} - ${errorBody}`);
  }
  return response.json();
}

const getYahooLeagues = (accessToken: string): Promise<any[]> =>
    yahooApiFetch('https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json', accessToken)
    .then(data => data.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues ?
        Object.values(data.fantasy_content.users[0].user[1].games[0].game[1].leagues).filter((l: any) => l.league).map((l: any) => l.league[0]) : []);

const getYahooUserTeamsInLeague = (accessToken: string, leagueKey: string): Promise<YahooTeam[]> =>
  yahooApiFetch(`https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/teams?format=json`, accessToken)
  .then(data => data.fantasy_content?.league?.[1]?.teams ?
    Object.values(data.fantasy_content.league[1].teams).filter((t: any) => t.team).map((t: any) => ({...t.team[0][0], league_key: leagueKey})) : []);

const getYahooRoster = (accessToken: string, teamKey: string): Promise<YahooPlayer[]> =>
  yahooApiFetch(`https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/roster?format=json`, accessToken)
  .then(data => data.fantasy_content?.team?.[1]?.roster?.players ?
    Object.values(data.fantasy_content.team[1].roster.players).filter((p: any) => p.player).map((p: any) => p.player[0]) : []);

const getYahooMatchupsForTeam = async (accessToken: string, teamKey: string, week: number): Promise<YahooMatchup | null> => {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/matchups;weeks=${week}?format=json`;
    const data = await yahooApiFetch(url, accessToken);
    const matchupsData = data.fantasy_content?.team?.[1]?.matchups?.[0]?.matchup;
    if (!matchupsData) return null;

    const teams = matchupsData['0'].teams;
    const userTeamData = Object.values(teams).find((t: any) => t.team[0][0].team_key === teamKey) as any;
    const opponentTeamData = Object.values(teams).find((t: any) => t.team[0][0].team_key !== teamKey) as any;

    if (!userTeamData || !opponentTeamData) return null;

    return {
        userTeam: { ...userTeamData.team[0][0], totalPoints: userTeamData.team[1].team_points.total },
        opponentTeam: { ...opponentTeamData.team[0][0], totalPoints: opponentTeamData.team[1].team_points.total },
    };
};

const getYahooPlayerScores = (accessToken: string, teamKey: string): Promise<YahooPlayerScore[]> =>
  yahooApiFetch(`https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/player_stats?format=json`, accessToken)
  .then(data => data.fantasy_content?.team?.[1]?.players ?
    Object.values(data.fantasy_content.team[1].players).filter((p: any) => p.player).map((p: any) => ({ player_key: p.player[0][0].player_key, totalPoints: p.player[1].player_points.total })) : []);


export const YahooProvider: FantasyFootballProvider = {
  connect: async (userId, data) => ({ success: true }), // OAuth flow is handled on the client
  removeIntegration: async (integrationId) => {
    const supabase = createClient();
    const { error } = await supabase.from('user_integrations').delete().eq('id', integrationId);
    return { success: !error, error: error?.message };
  },
  getTeams: async (integrationId) => {
    try {
      const accessToken = await getYahooAccessToken(integrationId);
      const supabase = createClient();
      const { data: integration } = await supabase.from('user_integrations').select('provider_user_id').eq('id', integrationId).single();
      if (!integration) return { teams: [], error: 'Integration not found' };

      const leagues = await getYahooLeagues(accessToken);
      const week = await getCurrentNflWeek();
      const sleeperPlayers = await getSleeperPlayers();

      const teams: Team[] = [];
      for (const league of leagues) {
        const teamsInLeague = await getYahooUserTeamsInLeague(accessToken, league.league_key);
        const userTeamInLeague = teamsInLeague.find(t => t.managers.manager.guid === integration.provider_user_id);

        if (!userTeamInLeague) continue;

        const matchups = await getYahooMatchupsForTeam(accessToken, userTeamInLeague.team_key, week);
        if (!matchups) continue;

        const { userTeam, opponentTeam } = matchups;
        const [userPlayers, opponentPlayers, userPlayerScores, opponentPlayerScores] = await Promise.all([
          getYahooRoster(accessToken, userTeam.team_key),
          getYahooRoster(accessToken, opponentTeam.team_key),
          getYahooPlayerScores(accessToken, userTeam.team_key),
          getYahooPlayerScores(accessToken, opponentTeam.team_key),
        ]);

        const userScoresMap = new Map(userPlayerScores.map(p => [p.player_key, p.totalPoints]));
        const opponentScoresMap = new Map(opponentPlayerScores.map(p => [p.player_key, p.totalPoints]));

        const mapYahooPlayer = (p: YahooPlayer, scoresMap: Map<string, number>): Player => {
          const sleeperId = sleeperPlayers[p.name.full.toLowerCase()];
          return {
            id: p.player_key,
            name: p.name.full,
            position: p.display_position,
            realTeam: p.editorial_team_abbr,
            score: scoresMap.get(p.player_key) || 0,
            gameStatus: 'pregame',
            onUserTeams: 0,
            onOpponentTeams: 0,
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
            imageUrl: sleeperId ? `https://sleepercdn.com/content/nfl/players/thumb/${sleeperId}.jpg` : p.headshot.url,
            on_bench: p.is_on_bench,
          };
        };

        teams.push({
          id: userTeamInLeague.team_key,
          name: userTeam.name,
          totalScore: parseFloat(userTeam.totalPoints) || 0,
          players: userPlayers.map(p => mapYahooPlayer(p, userScoresMap)),
          opponent: {
            name: opponentTeam.name,
            totalScore: parseFloat(opponentTeam.totalPoints) || 0,
            players: opponentPlayers.map(p => mapYahooPlayer(p, opponentScoresMap)),
          },
        });
      }
      return { teams, error: null };
    } catch (error: any) {
      return { teams: [], error: error.message };
    }
  },

  getLeagues: async (integrationId: number): Promise<{ leagues: ProviderLeague[]; error: any; }> => {
    try {
        const accessToken = await getYahooAccessToken(integrationId);
        const leagues = await getYahooLeagues(accessToken);
        return { leagues: leagues.map(l => ({ id: l.league_key, name: l.name })), error: null };
    } catch (error: any) {
        return { leagues: [], error: error.message };
    }
  },

  getLeagueMatchups: async (integrationId, leagueId, week) => ({ matchups: [], error: 'Not implemented' }),
  getRoster: async (integrationId, leagueId, teamId) => ({ players: [], error: 'Not implemented' }),
};
