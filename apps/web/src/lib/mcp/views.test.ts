import type { Player, Team } from '@roster-loom/core';

import {
  aggregatePlayerExposure,
  buildRootingGuide,
  describeMatchup,
  findTeamByLeagueKey,
  leagueKeyFor,
  searchPlayerExposure,
  summarizeLeagues,
} from './views';

function player(overrides: Partial<Player> & { name: string }): Player {
  return {
    id: overrides.name,
    position: 'RB',
    realTeam: 'KC',
    score: 10,
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
  };
}

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: 1,
    name: 'My Team',
    league: {
      provider: 'sleeper',
      providerLeagueId: '12345',
      name: 'Dynasty League',
      season: '2026',
      totalRosters: 12,
    },
    totalScore: 100,
    players: [player({ name: 'Player A' })],
    opponent: {
      name: 'Their Team',
      totalScore: 90,
      players: [player({ name: 'Player B' })],
    },
    ...overrides,
  };
}

describe('leagueKeyFor', () => {
  it('prefers the provider league id', () => {
    expect(leagueKeyFor(team(), 0)).toBe('sleeper:12345');
  });

  it('falls back to the index when the league has no id', () => {
    const withoutLeague = team({ league: undefined });
    expect(leagueKeyFor(withoutLeague, 2)).toBe('league-3');
  });

  it('stays unique when providers reuse an unset team id', () => {
    // Sleeper leagues resolved live carry no database id, so every team
    // arrives with the same `id` — keys must not collide.
    const teams = [
      team({ id: undefined as unknown as number, league: { provider: 'sleeper', providerLeagueId: 'a', name: 'A' } }),
      team({ id: undefined as unknown as number, league: { provider: 'sleeper', providerLeagueId: 'b', name: 'B' } }),
    ];

    const keys = teams.map((entry, index) => leagueKeyFor(entry, index));
    expect(new Set(keys).size).toBe(2);
  });
});

describe('summarizeLeagues', () => {
  it('reports the margin and starters yet to play', () => {
    const teams = [
      team({
        totalScore: 110.55,
        players: [
          player({ name: 'Starter', gameStatus: 'pregame' }),
          player({ name: 'Played', gameStatus: 'final' }),
          player({ name: 'Benched', gameStatus: 'pregame', onBench: true }),
        ],
        opponent: {
          name: 'Their Team',
          totalScore: 100,
          players: [player({ name: 'Opp', gameStatus: 'final' })],
        },
      }),
    ];

    const [summary] = summarizeLeagues(teams);

    expect(summary.leagueName).toBe('Dynasty League');
    expect(summary.margin).toBeCloseTo(10.6, 5);
    // The benched pregame player must not count.
    expect(summary.startersYetToPlay).toBe(1);
    expect(summary.opponentStartersYetToPlay).toBe(0);
  });

  it('falls back to the team name when no league metadata exists', () => {
    const [summary] = summarizeLeagues([team({ league: undefined })]);

    expect(summary.leagueName).toBe('My Team');
    expect(summary.provider).toBe('unknown');
  });
});

describe('findTeamByLeagueKey', () => {
  const teams = [team()];

  it('matches the exact key', () => {
    expect(findTeamByLeagueKey(teams, 'sleeper:12345')?.team.name).toBe('My Team');
  });

  it('matches case-insensitively', () => {
    expect(findTeamByLeagueKey(teams, 'SLEEPER:12345')).not.toBeNull();
  });

  it('falls back to the league name', () => {
    expect(findTeamByLeagueKey(teams, 'Dynasty League')?.leagueKey).toBe('sleeper:12345');
  });

  it('returns null for an unknown key', () => {
    expect(findTeamByLeagueKey(teams, 'nope')).toBeNull();
  });
});

describe('describeMatchup', () => {
  it('splits starters from bench on both sides', () => {
    const source = team({
      players: [
        player({ name: 'Starter' }),
        player({ name: 'Bench', onBench: true }),
      ],
      opponent: {
        name: 'Their Team',
        totalScore: 90,
        players: [player({ name: 'Opp Bench', onBench: true })],
      },
    });

    const matchup = describeMatchup(source, 'sleeper:12345');

    expect(matchup.you.starters.map((p) => p.name)).toEqual(['Starter']);
    expect(matchup.you.bench.map((p) => p.name)).toEqual(['Bench']);
    expect(matchup.opponent.starters).toHaveLength(0);
    expect(matchup.opponent.bench).toHaveLength(1);
  });

  it('labels live game state', () => {
    const source = team({
      players: [
        player({
          name: 'Live',
          gameStatus: 'in_progress',
          gameQuarter: 'Q3',
          gameClock: '04:21',
        }),
      ],
    });

    const [live] = describeMatchup(source, 'k').you.starters;

    expect(live.gameStatusLabel).toBe('Q3 04:21');
    expect(live.percentOfGameRemaining).toBeGreaterThan(0);
  });
});

describe('aggregatePlayerExposure', () => {
  const shared = { name: 'Shared Guy', realTeam: 'SF' };

  const teams = [
    team({
      league: { provider: 'sleeper', providerLeagueId: 'a', name: 'League A' },
      players: [player({ ...shared })],
      opponent: { name: 'Opp A', totalScore: 0, players: [] },
    }),
    team({
      league: { provider: 'yahoo', providerLeagueId: 'b', name: 'League B' },
      players: [player({ ...shared, onBench: true })],
      opponent: {
        name: 'Opp B',
        totalScore: 0,
        players: [player({ name: 'Enemy', realTeam: 'DAL' })],
      },
    }),
    team({
      league: { provider: 'yahoo', providerLeagueId: 'c', name: 'League C' },
      players: [],
      opponent: { name: 'Opp C', totalScore: 0, players: [player({ ...shared })] },
    }),
  ];

  it('deduplicates a player across leagues and records each side', () => {
    const exposures = aggregatePlayerExposure(teams);
    const sharedPlayer = exposures.find((entry) => entry.name === 'Shared Guy');

    expect(sharedPlayer?.onYourTeams).toBe(2);
    expect(sharedPlayer?.onOpponentTeams).toBe(1);
    expect(sharedPlayer?.conflicted).toBe(true);
    expect(sharedPlayer?.rosteredIn).toEqual([
      { leagueKey: 'sleeper:a', leagueName: 'League A', starting: true },
      { leagueKey: 'yahoo:b', leagueName: 'League B', starting: false },
    ]);
  });

  it('does not merge same-named players on different NFL teams', () => {
    const exposures = aggregatePlayerExposure([
      team({
        players: [player({ name: 'Same Name', realTeam: 'KC' })],
        opponent: {
          name: 'Opp',
          totalScore: 0,
          players: [player({ name: 'Same Name', realTeam: 'BUF' })],
        },
      }),
    ]);

    expect(exposures.filter((entry) => entry.name === 'Same Name')).toHaveLength(2);
  });

  it('sorts by total exposure', () => {
    expect(aggregatePlayerExposure(teams)[0].name).toBe('Shared Guy');
  });
});

describe('searchPlayerExposure', () => {
  const exposures = aggregatePlayerExposure([
    team({
      players: [player({ name: 'Patrick Mahomes', realTeam: 'KC' })],
      opponent: {
        name: 'Opp',
        totalScore: 0,
        players: [player({ name: 'Josh Allen', realTeam: 'BUF' })],
      },
    }),
  ]);

  it('matches on partial name, case-insensitively', () => {
    expect(searchPlayerExposure(exposures, 'mahomes').map((e) => e.name)).toEqual([
      'Patrick Mahomes',
    ]);
  });

  it('matches on NFL team', () => {
    expect(searchPlayerExposure(exposures, 'buf').map((e) => e.name)).toEqual([
      'Josh Allen',
    ]);
  });

  it('returns nothing for a blank query', () => {
    expect(searchPlayerExposure(exposures, '   ')).toEqual([]);
  });
});

describe('buildRootingGuide', () => {
  it('separates players to root for, against, and conflicted', () => {
    const hero = { name: 'Hero', realTeam: 'SF' };
    const enemy = { name: 'Enemy', realTeam: 'DAL' };
    const conflicted = { name: 'Conflicted', realTeam: 'PHI' };

    const guide = buildRootingGuide([
      team({
        name: 'Team One',
        players: [player({ ...hero }), player({ ...conflicted })],
        opponent: { name: 'Opp One', totalScore: 0, players: [player({ ...enemy })] },
      }),
      team({
        name: 'Team Two',
        players: [player({ ...hero })],
        opponent: {
          name: 'Opp Two',
          totalScore: 0,
          players: [player({ ...enemy }), player({ ...conflicted })],
        },
      }),
    ]);

    expect(guide.rootFor.map((p) => p.name)).toEqual(['Hero']);
    expect(guide.rootAgainst.map((p) => p.name)).toEqual(['Enemy']);
    expect(guide.conflicted.map((p) => p.name)).toEqual(['Conflicted']);
    expect(guide.conflicted[0].yourLeagues).toEqual(['Team One']);
    expect(guide.conflicted[0].opponentLeagues).toEqual(['Opp Two']);
  });
});
