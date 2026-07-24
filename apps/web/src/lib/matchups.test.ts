import {
  assignTeamColors,
  createPlayerAggregationKey,
  groupMatchupPlayers,
  groupPlayersByPosition,
  processMatchups,
  MATCHUP_COLORS,
  mockTeams,
} from '@roster-loom/core';
import type { Player, Team } from '@roster-loom/core';

const makePlayer = (overrides: Partial<Player> & Pick<Player, 'name' | 'realTeam'>): Player => ({
  id: `${overrides.name}-${overrides.realTeam}`,
  position: 'WR',
  score: 0,
  gameStatus: 'pregame',
  gameStartTime: null,
  gameQuarter: null,
  gameClock: null,
  onUserTeams: 0,
  onOpponentTeams: 0,
  gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
  imageUrl: '',
  onBench: false,
  ...overrides,
});

const makeTeam = (
  id: number,
  name: string,
  players: Player[],
  opponentName: string,
  opponentPlayers: Player[],
): Team => ({
  id,
  name,
  totalScore: players.reduce((sum, p) => sum + p.score, 0),
  players,
  opponent: {
    name: opponentName,
    totalScore: opponentPlayers.reduce((sum, p) => sum + p.score, 0),
    players: opponentPlayers,
  },
});

describe('createPlayerAggregationKey', () => {
  it('normalizes name + team, case-insensitive and trimmed', () => {
    expect(createPlayerAggregationKey(makePlayer({ name: ' Josh Allen ', realTeam: 'BUF' }))).toBe(
      'josh allen-buf',
    );
  });

  it('returns null when name or team is missing', () => {
    expect(createPlayerAggregationKey(makePlayer({ name: '', realTeam: 'BUF' }))).toBeNull();
    expect(createPlayerAggregationKey(makePlayer({ name: 'X', realTeam: '' }))).toBeNull();
  });
});

describe('assignTeamColors', () => {
  it('cycles through the palette by team order', () => {
    const teams = Array.from({ length: MATCHUP_COLORS.length + 1 }, (_, i) =>
      makeTeam(i, `Team ${i}`, [], 'Opp', []),
    );
    const colors = assignTeamColors(teams);
    expect(colors.get(0)).toBe(MATCHUP_COLORS[0]);
    expect(colors.get(MATCHUP_COLORS.length)).toBe(MATCHUP_COLORS[0]); // wraps around
  });
});

describe('groupPlayersByPosition', () => {
  it('buckets known positions and lumps the rest into Other', () => {
    const players = [
      makePlayer({ name: 'A', realTeam: 'KC', position: 'QB' }),
      makePlayer({ name: 'B', realTeam: 'SF', position: 'rb' }),
      makePlayer({ name: 'C', realTeam: 'MIA', position: 'K' }),
    ];
    const grouped = groupPlayersByPosition(players);
    expect(grouped.QB).toHaveLength(1);
    expect(grouped.RB).toHaveLength(1);
    expect(grouped.Other).toHaveLength(1);
    expect(grouped.WR).toHaveLength(0);
  });
});

describe('groupMatchupPlayers', () => {
  it('deduplicates a player across the user teams and records a color per matchup', () => {
    const mahomesA = makePlayer({ name: 'Patrick Mahomes', realTeam: 'KC', position: 'QB', score: 10 });
    const mahomesB = makePlayer({ name: 'Patrick Mahomes', realTeam: 'KC', position: 'QB', score: 10 });
    const teams = [
      makeTeam(1, 'Team One', [mahomesA], 'Opp One', []),
      makeTeam(2, 'Team Two', [mahomesB], 'Opp Two', []),
    ];

    const { myPlayers, opponentPlayers } = groupMatchupPlayers(teams);

    expect(myPlayers).toHaveLength(1);
    expect(myPlayers[0].count).toBe(2);
    expect(myPlayers[0].matchupColors).toHaveLength(2);
    expect(myPlayers[0].matchupColors.map((m) => m.color)).toEqual([
      MATCHUP_COLORS[0],
      MATCHUP_COLORS[1],
    ]);
    expect(opponentPlayers).toHaveLength(0);
  });

  it('uses display data from the highest-priority team for a shared player', () => {
    const lowPriority = makePlayer({ name: 'Star', realTeam: 'KC', score: 5 });
    const highPriority = makePlayer({ name: 'Star', realTeam: 'KC', score: 42 });
    const teams = [
      makeTeam(1, 'Low', [lowPriority], 'Opp', []),
      makeTeam(2, 'High', [highPriority], 'Opp', []),
    ];

    // Team 2 is highest priority, so its score (42) should win.
    const { myPlayers } = groupMatchupPlayers(teams, { priorityOrder: [2, 1] });
    expect(myPlayers[0].score).toBe(42);
  });

  it('collapses a bench-everywhere player as benched in its matchup color', () => {
    const benched = makePlayer({ name: 'Backup', realTeam: 'NYJ', onBench: true });
    const teams = [makeTeam(1, 'Solo', [benched], 'Opp', [])];
    const { myPlayers } = groupMatchupPlayers(teams);
    expect(myPlayers[0].matchupColors[0].onBench).toBe(true);
  });
});

describe('processMatchups', () => {
  it('classifies heroes, enemies, and double agents from the mock data', () => {
    const { fantasyHeroes, publicEnemies, doubleAgents } = processMatchups(mockTeams);

    // Mahomes starts on both of the user's teams and no opponent's -> hero.
    expect(fantasyHeroes.some((p) => p.name === 'Patrick Mahomes')).toBe(true);
    // McCaffrey is on a user team and an opponent team -> double agent.
    expect(doubleAgents.some((p) => p.name === 'C. McCaffrey')).toBe(true);
    // No player is on 2+ opponent teams in the mock data.
    expect(publicEnemies).toHaveLength(0);
  });

  it('records the team names a hero appears on', () => {
    const { fantasyHeroes } = processMatchups(mockTeams);
    const mahomes = fantasyHeroes.find((p) => p.name === 'Patrick Mahomes');
    expect(mahomes?.matchups).toEqual(['Gridiron Gladiators', 'Endzone Enforcers']);
  });
});
