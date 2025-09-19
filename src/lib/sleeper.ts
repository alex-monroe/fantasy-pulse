import {
  Player,
  SleeperMatchup,
  SleeperPlayer,
  SleeperRoster,
  SleeperNflState,
} from '@/lib/types';

export async function getNflState(): Promise<SleeperNflState> {
  const response = await fetch('https://api.sleeper.app/v1/state/nfl', {
    next: { revalidate: 60 },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch NFL state');
  }
  return response.json();
}

export type MapSleeperPlayerParams = {
  playerId: string;
  playersData: Record<string, SleeperPlayer>;
  matchup: SleeperMatchup;
  roster: SleeperRoster | null;
  nflState: SleeperNflState;
};

/**
 * Maps a Sleeper player ID to the internal Player representation.
 * Returns null when player data cannot be found.
 */
export function mapSleeperPlayer({
  playerId,
  playersData,
  matchup,
  roster,
  nflState,
}: MapSleeperPlayerParams): Player | null {
  const player = playersData[playerId];
  if (!player) {
    return null;
  }

  const starters = roster?.starters ?? [];
  const computedName =
    player.full_name ||
    [player.first_name, player.last_name].filter(Boolean).join(' ');
  const name = computedName?.trim() ? computedName.trim() : 'Unknown Player';

  let gameStatus = 'pregame';
  const gameDetails = { score: '', timeRemaining: '', fieldPosition: '' };

  if (nflState.games) {
    const game = Object.values(nflState.games).find(
      (g) => g.home_team === player.team || g.away_team === player.team
    );

    if (game) {
      if (game.status === 'inprogress') {
        gameStatus = 'In-Progress';
        gameDetails.timeRemaining = `${game.quarter}, ${game.time_remaining}`;
      } else if (game.status === 'pre_game') {
        const date = new Date(game.start_time);
        gameStatus = date.toLocaleDateString('en-US', {
          weekday: 'short',
          hour: 'numeric',
          minute: 'numeric',
        });
      } else {
        gameStatus = game.status;
      }
    }
  }

  return {
    id: playerId,
    name,
    position: player.position ?? '',
    realTeam: player.team ?? '',
    score: matchup.players_points?.[playerId] ?? 0,
    gameStatus,
    onUserTeams: 0,
    onOpponentTeams: 0,
    gameDetails,
    imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
    onBench: !starters.includes(playerId),
  };
}
