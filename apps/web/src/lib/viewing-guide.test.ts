import { buildViewingGuide } from '@roster-loom/core';
import type { Player, Team } from '@roster-loom/core';

const player = (name: string, realTeam: string, extra: Partial<Player> = {}): Player =>
  ({
    id: name,
    name,
    position: 'WR',
    realTeam,
    score: 0,
    gameStatus: 'pregame',
    gameStartTime: '2026-09-20T17:00:00Z',
    onBench: false,
    ...extra,
  }) as Player;

const team = (name: string, mine: Player[], theirs: Player[]): Team =>
  ({ name, players: mine, opponent: { name: 'Opp', players: theirs } }) as unknown as Team;

describe('buildViewingGuide', () => {
  it('ranks games in a slot by distinct players across both sides and flags the top pick', () => {
    const g1 = { gameId: '1', gameLabel: 'A @ B' };
    const g2 = { gameId: '2', gameLabel: 'C @ D' };
    const slots = buildViewingGuide([
      team('T1', [player('P1', 'A', g1), player('P2', 'C', g2)], [player('P3', 'B', g1)]),
      team('T2', [player('P1', 'A', g1)], []),
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0].games.map((g) => [g.label, g.playerCount, g.isTopPick])).toEqual([
      ['A @ B', 2, true],
      ['C @ D', 1, false],
    ]);
    expect(slots[0].games[0].players[0].mine).toEqual(['T1', 'T2']);
  });

  it('skips finished games and bench players, and sorts slots chronologically', () => {
    const slots = buildViewingGuide([
      team(
        'T1',
        [
          player('Done', 'A', { gameStatus: 'final' }),
          player('Bench', 'B', { onBench: true }),
          player('Late', 'C', { gameStartTime: '2026-09-20T20:25:00Z' }),
          player('Early', 'D'),
        ],
        [],
      ),
    ]);
    expect(slots.map((s) => s.games[0].players[0].name)).toEqual(['Early', 'Late']);
  });
});
