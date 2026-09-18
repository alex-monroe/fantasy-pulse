import {
  formatWinProbability,
  projectMatchup,
  projectRoster,
  summarizeMatchup,
  summarizeWeek,
} from '@roster-loom/core';
import type { Player, Team } from '@roster-loom/core';

const makePlayer = (overrides: Partial<Player> & Pick<Player, 'name'>): Player => ({
  id: overrides.name,
  position: 'WR',
  realTeam: 'KC',
  score: 0,
  gameStatus: 'pregame',
  gameStartTime: null,
  gameQuarter: null,
  gameClock: null,
  onUserTeams: 1,
  onOpponentTeams: 0,
  gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
  imageUrl: '',
  onBench: false,
  ...overrides,
});

/** A starter halfway through their game: one full quarter plus the whole third. */
const halfPlayed = (overrides: Partial<Player> & Pick<Player, 'name'>): Player =>
  makePlayer({
    gameStatus: 'in_progress',
    gameQuarter: 'Q3',
    gameClock: '15:00',
    ...overrides,
  });

const makeTeam = (
  name: string,
  score: number,
  players: Player[],
  opponentScore: number,
  opponentPlayers: Player[],
): Team => ({
  id: 1,
  name,
  totalScore: score,
  players,
  opponent: { name: `${name} opponent`, totalScore: opponentScore, players: opponentPlayers },
});

describe('projectRoster', () => {
  it('adds a pregame starter’s whole projection to the current score', () => {
    const projection = projectRoster([makePlayer({ name: 'A', projectedPoints: 12 })], 30);

    expect(projection.current).toBe(30);
    expect(projection.remaining).toBeCloseTo(12, 5);
    expect(projection.projected).toBeCloseTo(42, 5);
    expect(projection.projectedStarters).toBe(1);
  });

  it('only adds the share of a live starter’s projection still to be earned', () => {
    // Half the game left, so half of the 12-point projection is still to come.
    const projection = projectRoster([halfPlayed({ name: 'A', score: 8, projectedPoints: 12 })], 30);

    expect(projection.remaining).toBeCloseTo(6, 5);
    expect(projection.projected).toBeCloseTo(36, 5);
  });

  it('adds nothing for a starter whose game is over', () => {
    const projection = projectRoster(
      [makePlayer({ name: 'A', score: 18, projectedPoints: 12, gameStatus: 'final' })],
      30,
    );

    expect(projection.remaining).toBe(0);
    expect(projection.projected).toBe(30);
    expect(projection.projectedStarters).toBe(0);
    expect(projection.standardDeviation).toBe(0);
  });

  it('ignores the bench', () => {
    const projection = projectRoster(
      [
        makePlayer({ name: 'Starter', projectedPoints: 12 }),
        makePlayer({ name: 'Benched', projectedPoints: 20, onBench: true }),
      ],
      0,
    );

    expect(projection.starters).toBe(1);
    expect(projection.projected).toBeCloseTo(12, 5);
  });

  it('counts a starter with no projection without inventing points for them', () => {
    const projection = projectRoster([makePlayer({ name: 'A' })], 30);

    expect(projection.remaining).toBe(0);
    expect(projection.projected).toBe(30);
    expect(projection.projectedStarters).toBe(0);
    expect(projection.unprojectedStarters).toBe(1);
    // They are still football left to play, so they widen the spread.
    expect(projection.standardDeviation).toBeGreaterThan(0);
  });

  it('narrows the spread as a starter’s game runs down', () => {
    const pregame = projectRoster([makePlayer({ name: 'A', projectedPoints: 12 })], 0);
    const halfway = projectRoster([halfPlayed({ name: 'A', score: 6, projectedPoints: 12 })], 6);

    expect(halfway.standardDeviation).toBeLessThan(pregame.standardDeviation);
  });
});

describe('projectMatchup', () => {
  it('projects both sides of the matchup, not just the user’s', () => {
    const team = makeTeam(
      'Mine',
      40,
      [makePlayer({ name: 'Mine A', projectedPoints: 10 })],
      35,
      [makePlayer({ name: 'Theirs A', projectedPoints: 20 })],
    );

    const projection = projectMatchup(team);

    expect(projection.team.projected).toBeCloseTo(50, 5);
    expect(projection.opponent.projected).toBeCloseTo(55, 5);
    expect(projection.differential).toBeCloseTo(-5, 5);
    expect(projection.hasProjections).toBe(true);
  });

  it('calls a matchup with equal projections a coin flip', () => {
    const team = makeTeam(
      'Mine',
      0,
      [makePlayer({ name: 'Mine A', projectedPoints: 12 })],
      0,
      [makePlayer({ name: 'Theirs A', projectedPoints: 12 })],
    );

    expect(projectMatchup(team).winProbability).toBeCloseTo(0.5, 5);
  });

  it('is more confident about a bigger projected lead', () => {
    const narrow = projectMatchup(
      makeTeam('Mine', 55, [makePlayer({ name: 'M', projectedPoints: 10 })], 50, [
        makePlayer({ name: 'T', projectedPoints: 10 }),
      ]),
    );
    const wide = projectMatchup(
      makeTeam('Mine', 90, [makePlayer({ name: 'M', projectedPoints: 10 })], 50, [
        makePlayer({ name: 'T', projectedPoints: 10 }),
      ]),
    );

    expect(narrow.winProbability).toBeGreaterThan(0.5);
    expect(wide.winProbability).toBeGreaterThan(narrow.winProbability);
  });

  it('is less confident about the same lead with more football left', () => {
    const oneStarterEach = projectMatchup(
      makeTeam('Mine', 60, [makePlayer({ name: 'M', projectedPoints: 10 })], 50, [
        makePlayer({ name: 'T', projectedPoints: 10 }),
      ]),
    );
    const fiveStartersEach = projectMatchup(
      makeTeam(
        'Mine',
        60,
        Array.from({ length: 5 }, (_, i) => makePlayer({ name: `M${i}`, projectedPoints: 10 })),
        50,
        Array.from({ length: 5 }, (_, i) => makePlayer({ name: `T${i}`, projectedPoints: 10 })),
      ),
    );

    // Same projected margin either way — the busier week is just less settled.
    expect(fiveStartersEach.differential).toBeCloseTo(oneStarterEach.differential, 5);
    expect(fiveStartersEach.winProbability).toBeLessThan(oneStarterEach.winProbability);
  });

  it('pulls toward a coin flip when starters are missing projections', () => {
    const projected = projectMatchup(
      makeTeam('Mine', 60, [makePlayer({ name: 'M', projectedPoints: 10 })], 50, [
        makePlayer({ name: 'T', projectedPoints: 10 }),
      ]),
    );
    const withUnknowns = projectMatchup(
      makeTeam(
        'Mine',
        60,
        [makePlayer({ name: 'M', projectedPoints: 10 }), makePlayer({ name: 'M2' })],
        50,
        [makePlayer({ name: 'T', projectedPoints: 10 }), makePlayer({ name: 'T2' })],
      ),
    );

    expect(withUnknowns.unprojectedStarters).toBe(2);
    expect(withUnknowns.winProbability).toBeLessThan(projected.winProbability);
    expect(withUnknowns.winProbability).toBeGreaterThan(0.5);
  });

  it('settles at a certainty once every game is final', () => {
    const won = projectMatchup(
      makeTeam(
        'Mine',
        100,
        [makePlayer({ name: 'M', score: 100, gameStatus: 'final' })],
        90,
        [makePlayer({ name: 'T', score: 90, gameStatus: 'final' })],
      ),
    );

    expect(won.settled).toBe(true);
    expect(won.winProbability).toBe(1);
    expect(won.hasProjections).toBe(true);
  });

  it('declines to project when a roster came back empty', () => {
    const team = makeTeam('Mine', 60, [makePlayer({ name: 'M', projectedPoints: 10 })], 50, []);

    // Every point projected for the user would otherwise read as free.
    expect(projectMatchup(team).hasProjections).toBe(false);
  });
});

describe('formatWinProbability', () => {
  it('rounds to a whole percent', () => {
    expect(formatWinProbability(0.634)).toBe('63%');
    expect(formatWinProbability(0.5)).toBe('50%');
  });

  it('keeps an unfinished matchup off the extremes', () => {
    expect(formatWinProbability(0.999)).toBe('>99%');
    expect(formatWinProbability(0.001)).toBe('<1%');
  });

  it('reads a decided matchup as decided', () => {
    expect(formatWinProbability(1, true)).toBe('100%');
    expect(formatWinProbability(0, true)).toBe('0%');
  });
});

describe('summarizeMatchup projections', () => {
  it('carries the projection alongside the live scores', () => {
    const summary = summarizeMatchup(
      makeTeam('Mine', 40, [makePlayer({ name: 'M', projectedPoints: 10 })], 50, [
        makePlayer({ name: 'T', projectedPoints: 5 }),
      ]),
    );

    expect(summary.score).toBe(40);
    expect(summary.projection.team.projected).toBeCloseTo(50, 5);
    expect(summary.projection.opponent.projected).toBeCloseTo(55, 5);
    // Behind now, and still behind on projection.
    expect(summary.isLeading).toBe(false);
    expect(summary.projection.winProbability).toBeLessThan(0.5);
  });
});

describe('summarizeWeek projections', () => {
  it('tallies the projected record and the expected wins', () => {
    const projectedWin = makeTeam(
      'Ahead',
      60,
      [makePlayer({ name: 'A', projectedPoints: 20 })],
      50,
      [makePlayer({ name: 'B', projectedPoints: 5 })],
    );
    const projectedLoss = makeTeam(
      'Behind',
      40,
      [makePlayer({ name: 'C', projectedPoints: 5 })],
      50,
      [makePlayer({ name: 'D', projectedPoints: 20 })],
    );

    const week = summarizeWeek([projectedWin, projectedLoss]);

    expect(week.projectedMatchups).toBe(2);
    expect(week.projectedLeading).toBe(1);
    expect(week.projectedTrailing).toBe(1);
    expect(week.expectedWins).toBeCloseTo(
      projectMatchup(projectedWin).winProbability +
        projectMatchup(projectedLoss).winProbability,
      5,
    );
  });

  it('leaves matchups it cannot project out of the tally', () => {
    const week = summarizeWeek([makeTeam('No data', 60, [], 50, [])]);

    expect(week.total).toBe(1);
    expect(week.projectedMatchups).toBe(0);
    expect(week.expectedWins).toBe(0);
  });
});
