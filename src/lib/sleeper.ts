import {
  Player,
  SleeperMatchup,
  SleeperPlayer,
  SleeperRoster,
} from '@/lib/types';

export type MapSleeperPlayerParams = {
  playerId: string;
  playersData: Record<string, SleeperPlayer>;
  matchup: SleeperMatchup;
  roster: SleeperRoster | null;
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

  return {
    id: playerId,
    name,
    position: player.position ?? '',
    realTeam: player.team ?? '',
    score: matchup.players_points?.[playerId] ?? 0,
    gameStatus: 'pregame',
    onUserTeams: 0,
    onOpponentTeams: 0,
    gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
    imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
    onBench: !starters.includes(playerId),
  };
}
