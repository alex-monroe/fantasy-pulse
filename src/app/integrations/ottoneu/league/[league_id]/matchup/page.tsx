'use client';
import { PlayerCard } from '@/components/player-card';
import { getOttoneuTeamInfo, getOttoneuLeagueTeams, getOttoneuRoster } from '../actions';
import { useEffect, useState } from 'react';
import { Player } from '@/lib/types';

type OttoneuMatchupPageProps = {
  params: {
    league_id: string;
    team_id: string;
  };
};

export default function OttoneuMatchupPage({ params }: OttoneuMatchupPageProps) {
  const [userRoster, setUserRoster] = useState<Player[]>([]);
  const [opponentRoster, setOpponentRoster] = useState<Player[]>([]);
  const [userTeam, setUserTeam] = useState<any | null>(null);
  const [opponentTeam, setOpponentTeam] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMatchupData = async () => {
      const teamInfo = await getOttoneuTeamInfo(
        `https://ottoneu.fangraphs.com/football/${params.league_id}/team/${params.team_id}`
      );

      if ('error' in teamInfo) {
        setError(teamInfo.error);
        return;
      }

      setUserTeam({ name: teamInfo.teamName });

      if (teamInfo.matchup) {
        const { teams, error: teamsError } = await getOttoneuLeagueTeams(params.league_id);
        if (teamsError) {
          setError(teamsError);
          return;
        }

        const opponent = teams.find((team: any) => team.name === teamInfo.matchup.opponentName);
        if (opponent) {
          setOpponentTeam({ name: opponent.name });
          const [userRosterRes, opponentRosterRes] = await Promise.all([
            getOttoneuRoster(params.league_id, params.team_id),
            getOttoneuRoster(params.league_id, opponent.id),
          ]);

          if (userRosterRes.error || opponentRosterRes.error) {
            setError(userRosterRes.error || opponentRosterRes.error);
            return;
          }

          setUserRoster(userRosterRes.roster || []);
          setOpponentRoster(opponentRosterRes.roster || []);
        }
      }
    };

    fetchMatchupData();
  }, [params.league_id, params.team_id]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userTeam) {
    return <div>Loading...</div>;
  }

  const userPlayerIds = new Set(userRoster.map((p) => p.id));
  const opponentPlayerIds = new Set(opponentRoster.map((p) => p.id));

  const allPlayers = [...userRoster, ...opponentRoster].reduce<Record<string, Player>>((acc, player) => {
    const key = `${player.id}-${player.name}`;
    if (!acc[key]) {
      acc[key] = { ...player, onUserTeams: [], onOpponentTeams: [] };
    }
    if (userPlayerIds.has(player.id)) {
      acc[key].onUserTeams.push(userTeam.name);
    }
    if (opponentPlayerIds.has(player.id)) {
      acc[key].onOpponentTeams.push(opponentTeam.name);
    }
    return acc;
  }, {});

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Ottoneu Matchup</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h2 className="text-xl font-semibold">{userTeam.name}</h2>
          <div className="space-y-2 mt-2">
            {Object.values(allPlayers)
              .filter((p) => p.onUserTeams.length > 0)
              .map((player) => (
                <PlayerCard key={player.id} player={player} />
              ))}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold">{opponentTeam?.name || 'Opponent'}</h2>
          <div className="space-y-2 mt-2">
            {Object.values(allPlayers)
              .filter((p) => p.onOpponentTeams.length > 0)
              .map((player) => (
                <PlayerCard key={player.id} player={player} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
