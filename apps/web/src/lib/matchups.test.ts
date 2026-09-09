import {
  assignTeamColors,
  createPlayerAggregationKey,
  getMatchupColor,
  getTeamKey,
  groupMatchupPlayers,
  groupPlayersByPosition,
  processMatchups,
  summarizeMatchup,
  summarizeWeek,
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

const makeSleeperTeam = (id: number, name: string, providerLeagueId: string): Team => ({
  ...makeTeam(id, name, [], 'Opp', []),
  league: { provider: 'sleeper', providerLeagueId, name: `${name} League` },
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

describe('getTeamKey', () => {
  it('identifies a team by its provider and league id', () => {
    const team = makeSleeperTeam(1, 'Team', 'league-a');
    expect(getTeamKey(team, 0)).toBe('sleeper:league-a');
  });

  it('tells apart leagues whose builder left the team id undefined', () => {
    // The Sleeper builder resolves leagues live from Sleeper's API, whose
    // payloads carry no database id, so every Sleeper team arrives with an
    // undefined id.
    const teams = ['league-a', 'league-b', 'league-c'].map((leagueId) =>
      makeSleeperTeam(undefined as unknown as number, `Team ${leagueId}`, leagueId),
    );

    expect(new Set(teams.map((team, index) => getTeamKey(team, index))).size).toBe(3);
  });

  it('falls back to the team id, then to the position, without a league', () => {
    expect(getTeamKey(makeTeam(7, 'Team', [], 'Opp', []), 2)).toBe('team-7');
    const idless = { ...makeTeam(0, 'Team', [], 'Opp', []), id: undefined as unknown as number };
    expect(getTeamKey(idless, 2)).toBe('team-index-2');
  });
});

describe('assignTeamColors', () => {
  it('assigns the palette in team order', () => {
    const teams = Array.from({ length: MATCHUP_COLORS.length }, (_, i) =>
      makeTeam(i, `Team ${i}`, [], 'Opp', []),
    );
    const colors = assignTeamColors(teams);
    MATCHUP_COLORS.forEach((color, index) => {
      expect(colors.get(getTeamKey(teams[index], index))).toBe(color);
    });
  });

  it('keeps every team a different color once the palette runs out', () => {
    const teams = Array.from({ length: MATCHUP_COLORS.length * 3 }, (_, i) =>
      makeTeam(i, `Team ${i}`, [], 'Opp', []),
    );
    const colors = assignTeamColors(teams);
    const assigned = teams.map((team, index) => colors.get(getTeamKey(team, index)));

    expect(assigned.every((color) => typeof color === 'string')).toBe(true);
    expect(new Set(assigned).size).toBe(teams.length);
  });

  it('gives every Sleeper league its own color despite their shared undefined id', () => {
    const teams = ['league-a', 'league-b', 'league-c'].map((leagueId) =>
      makeSleeperTeam(undefined as unknown as number, `Team ${leagueId}`, leagueId),
    );

    const colors = assignTeamColors(teams);
    const assigned = teams.map((team, index) => colors.get(getTeamKey(team, index)));

    expect(assigned).toEqual([MATCHUP_COLORS[0], MATCHUP_COLORS[1], MATCHUP_COLORS[2]]);
  });
});

describe('getMatchupColor', () => {
  it('returns the palette entry for the first matchups', () => {
    MATCHUP_COLORS.forEach((color, index) => {
      expect(getMatchupColor(index)).toBe(color);
    });
  });

  it('generates further hex colors that never repeat', () => {
    const colors = Array.from({ length: 60 }, (_, i) => getMatchupColor(i));
    colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('falls back to the first palette entry for an invalid index', () => {
    expect(getMatchupColor(-1)).toBe(MATCHUP_COLORS[0]);
    expect(getMatchupColor(Number.NaN)).toBe(MATCHUP_COLORS[0]);
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
    const { myPlayers } = groupMatchupPlayers(teams, { priorityOrder: ['team-2', 'team-1'] });
    expect(myPlayers[0].score).toBe(42);
  });

  it('gives a player a separate dot per Sleeper league despite their shared undefined id', () => {
    const teams = ['league-a', 'league-b', 'league-c'].map((leagueId) => ({
      ...makeSleeperTeam(undefined as unknown as number, `Team ${leagueId}`, leagueId),
      players: [makePlayer({ name: 'Patrick Mahomes', realTeam: 'KC', position: 'QB', score: 10 })],
    }));

    const { myPlayers } = groupMatchupPlayers(teams);

    expect(myPlayers).toHaveLength(1);
    expect(myPlayers[0].count).toBe(3);
    expect(myPlayers[0].matchupColors.map((matchup) => matchup.color)).toEqual([
      MATCHUP_COLORS[0],
      MATCHUP_COLORS[1],
      MATCHUP_COLORS[2],
    ]);
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

describe('summarizeMatchup', () => {
  const live = (name: string, score: number) =>
    makePlayer({ name, realTeam: 'KC', score, gameStatus: 'in_progress' });
  const pregame = (name: string) => makePlayer({ name, realTeam: 'BUF', gameStatus: 'pregame' });
  const final = (name: string, score: number) =>
    makePlayer({ name, realTeam: 'SF', score, gameStatus: 'final' });

  it('reports the differential and who is ahead', () => {
    const team = makeTeam(1, 'Mine', [live('A', 20)], 'Theirs', [final('B', 12)]);
    const summary = summarizeMatchup(team);

    expect(summary.score).toBe(20);
    expect(summary.opponentScore).toBe(12);
    expect(summary.differential).toBe(8);
    expect(summary.isLeading).toBe(true);
    expect(summary.isTied).toBe(false);
    expect(summary.scoreShare).toBeCloseTo(20 / 32, 5);
  });

  it('treats a level matchup as tied and splits the bar evenly at 0-0', () => {
    const team = makeTeam(1, 'Mine', [pregame('A')], 'Theirs', [pregame('B')]);
    const summary = summarizeMatchup(team);

    expect(summary.isTied).toBe(true);
    expect(summary.isLeading).toBe(false);
    expect(summary.scoreShare).toBe(0.5);
  });

  it('counts starters by game phase and ignores the bench', () => {
    const team = makeTeam(
      1,
      'Mine',
      [
        live('A', 10),
        pregame('B'),
        final('C', 5),
        makePlayer({ name: 'Benched', realTeam: 'KC', gameStatus: 'in_progress', onBench: true }),
      ],
      'Theirs',
      [live('D', 3)],
    );

    expect(summarizeMatchup(team).counts).toEqual({ live: 1, yetToPlay: 1, done: 1 });
    expect(summarizeMatchup(team).opponentCounts).toEqual({ live: 1, yetToPlay: 0, done: 0 });
  });
});

describe('summarizeWeek', () => {
  it('tallies leading, trailing, and tied matchups', () => {
    const winning = makeTeam(
      1,
      'Winning',
      [makePlayer({ name: 'A', realTeam: 'KC', score: 30 })],
      'Opp1',
      [makePlayer({ name: 'B', realTeam: 'SF', score: 10 })],
    );
    const losing = makeTeam(
      2,
      'Losing',
      [makePlayer({ name: 'C', realTeam: 'BUF', score: 5 })],
      'Opp2',
      [makePlayer({ name: 'D', realTeam: 'MIA', score: 25 })],
    );
    const level = makeTeam(3, 'Level', [], 'Opp3', []);

    expect(summarizeWeek([winning, losing, level])).toMatchObject({
      leading: 1,
      trailing: 1,
      tied: 1,
      total: 3,
    });
  });

  it('deduplicates a player rostered in several leagues', () => {
    const shared = () =>
      makePlayer({ name: 'Josh Allen', realTeam: 'BUF', score: 20, gameStatus: 'in_progress' });
    const teamA = makeTeam(1, 'A', [shared()], 'OppA', []);
    const teamB = makeTeam(2, 'B', [shared()], 'OppB', []);

    expect(summarizeWeek([teamA, teamB]).playersLive).toBe(1);
  });

  it('counts starters who have not kicked off yet', () => {
    const team = makeTeam(
      1,
      'A',
      [
        makePlayer({ name: 'Early', realTeam: 'KC', gameStatus: 'final' }),
        makePlayer({ name: 'Late', realTeam: 'LV', gameStatus: 'pregame' }),
        makePlayer({ name: 'Bench', realTeam: 'DEN', gameStatus: 'pregame', onBench: true }),
      ],
      'Opp',
      [],
    );

    expect(summarizeWeek([team]).playersYetToPlay).toBe(1);
  });
});
