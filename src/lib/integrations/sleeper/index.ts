import { FantasyFootballProvider, ProviderLeague } from '../types';
import { Team, Player } from '@/lib/types';
import { createClient } from '@/utils/supabase/server';

async function getCurrentNflWeek() {
  const nflStateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
  const nflState = await nflStateResponse.json();
  return nflState.week;
}

const sleeperApi = {
  get: async (endpoint: string) => {
    const res = await fetch(`https://api.sleeper.app/v1${endpoint}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || `Failed to fetch ${endpoint}`);
    }
    return res.json();
  },
};

const getLeaguesForUser = (providerUserId: string) => sleeperApi.get(`/user/${providerUserId}/leagues/nfl/${new Date().getFullYear()}`);
const getRostersForLeague = (leagueId: string) => sleeperApi.get(`/league/${leagueId}/rosters`);
const getMatchupsForLeague = (leagueId: string, week: string) => sleeperApi.get(`/league/${leagueId}/matchups/${week}`);
const getUsersInLeague = (leagueId: string) => sleeperApi.get(`/league/${leagueId}/users`);
const getNflPlayers = () => sleeperApi.get(`/players/nfl`);

export const SleeperProvider: FantasyFootballProvider = {
  connect: async (userId: string, data: { username: string }) => {
    const supabase = createClient();
    try {
      const sleeperUser = await sleeperApi.get(`/user/${data.username}`);
      if (!sleeperUser) return { success: false, error: 'User not found' };

      const { error } = await supabase.from('user_integrations').insert({
        user_id: userId,
        provider: 'sleeper',
        provider_user_id: sleeperUser.user_id,
      });

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  removeIntegration: async (integrationId: number) => {
    const supabase = createClient();
    const { error } = await supabase.from('user_integrations').delete().eq('id', integrationId);
    return { success: !error, error: error?.message };
  },

  getTeams: async (integrationId: number) => {
    const supabase = createClient();
    const { data: integration } = await supabase.from('user_integrations').select('*').eq('id', integrationId).single();
    if (!integration) return { teams: [], error: 'Integration not found' };

    try {
      const [leagues, week, playersData] = await Promise.all([
        getLeaguesForUser(integration.provider_user_id),
        getCurrentNflWeek(),
        getNflPlayers(),
      ]);

      const teams: Team[] = [];
      for (const league of leagues) {
        const [rosters, matchups, leagueUsers] = await Promise.all([
          getRostersForLeague(league.league_id),
          getMatchupsForLeague(league.league_id, week.toString()),
          getUsersInLeague(league.league_id),
        ]);

        const userRoster = rosters.find((r: any) => r.owner_id === integration.provider_user_id);
        if (!userRoster) continue;

        const userMatchup = matchups.find((m: any) => m.roster_id === userRoster.roster_id);
        if (!userMatchup) continue;

        const opponentMatchup = matchups.find((m: any) => m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id);
        const opponentRoster = opponentMatchup ? rosters.find((r: any) => r.roster_id === opponentMatchup.roster_id) : null;
        const opponentUser = opponentRoster ? leagueUsers.find((u: any) => u.user_id === opponentRoster.owner_id) : null;

        const mapPlayer = (playerId: string, roster: any, matchup: any): Player => {
          const player = playersData[playerId];
          return {
            id: playerId,
            name: player.full_name,
            position: player.position,
            realTeam: player.team,
            score: matchup.players_points?.[playerId] || 0,
            gameStatus: 'pregame',
            onUserTeams: 0,
            onOpponentTeams: 0,
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
            imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
            on_bench: !roster.starters.includes(playerId),
          };
        };

        teams.push({
          id: league.league_id,
          name: league.name,
          totalScore: userMatchup.points,
          players: userRoster.players.map((pId: string) => mapPlayer(pId, userRoster, userMatchup)),
          opponent: {
            name: opponentUser?.metadata?.team_name || opponentUser?.display_name || 'Opponent',
            totalScore: opponentMatchup?.points || 0,
            players: opponentRoster ? opponentRoster.players.map((pId: string) => mapPlayer(pId, opponentRoster, opponentMatchup)) : [],
          },
        });
      }
      return { teams, error: null };
    } catch (error: any) {
      return { teams: [], error: error.message };
    }
  },

  getLeagues: async (integrationId: number) => {
    const supabase = createClient();
    const { data: integration } = await supabase.from('user_integrations').select('provider_user_id').eq('id', integrationId).single();
    if (!integration) return { leagues: [], error: 'Integration not found' };
    const leagues = await getLeaguesForUser(integration.provider_user_id);
    return { leagues: leagues.map((l: any) => ({ id: l.league_id, name: l.name })), error: null };
  },

  getLeagueMatchups: async (integrationId: number, leagueId: string, week: string) => {
    try {
        const [matchups, rosters, users, players] = await Promise.all([
            getMatchupsForLeague(leagueId, week),
            getRostersForLeague(leagueId),
            getUsersInLeague(leagueId),
            getNflPlayers(),
        ]);

        const usersMap = new Map(users.map((user: any) => [user.user_id, user]));
        const rostersMap = new Map(rosters.map((roster: any) => [roster.roster_id, roster]));

        const enrichedMatchups = matchups.map((matchup: any) => {
            const roster = rostersMap.get(matchup.roster_id);
            if (!roster) return matchup;

            const user = usersMap.get(roster.owner_id);
            const matchupPlayers = matchup.players.map((playerId: string) => {
                const playerDetails = players[playerId];
                return {
                    player_id: playerId,
                    first_name: playerDetails?.first_name || 'Unknown',
                    last_name: playerDetails?.last_name || 'Player',
                    position: playerDetails?.position || 'N/A',
                    team: playerDetails?.team || 'N/A',
                    score: matchup.players_points[playerId] || 0,
                };
            });

            const totalPoints = matchupPlayers.reduce((acc: number, player: any) => acc + player.score, 0);

            return {
                ...matchup,
                user: user ? { display_name: user.display_name, avatar: user.avatar } : { display_name: 'Unknown User' },
                players: matchupPlayers,
                total_points: totalPoints,
            };
        });

        return { matchups: enrichedMatchups, error: null };
    } catch (error: any) {
        return { matchups: [], error: error.message };
    }
  },

  getRoster: async (integrationId: number, leagueId: string, teamId: string) => {
    // For sleeper, teamId is the roster_id
    try {
        const [rosters, playersData] = await Promise.all([
            getRostersForLeague(leagueId),
            getNflPlayers(),
        ]);

        const roster = rosters.find((r: any) => r.roster_id === teamId);
        if (!roster) return { players: [], error: 'Roster not found' };

        const mappedPlayers: Player[] = roster.players.map((playerId: string) => {
            const player = playersData[playerId];
            return {
                id: playerId,
                name: player.full_name,
                position: player.position,
                realTeam: player.team,
                score: 0, // Score is not available in this context
                gameStatus: 'pregame',
                onUserTeams: 0,
                onOpponentTeams: 0,
                gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
                imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
                on_bench: !roster.starters.includes(playerId),
            };
        });

        return { players: mappedPlayers, error: null };
    } catch (error: any) {
        return { players: [], error: error.message };
    }
  }
};
