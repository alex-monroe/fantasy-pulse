import {
  DEMO_SLATE_CYCLE_MS,
  generateDemoTeams,
  type Player,
  type Team,
} from '@roster-loom/core';

const CYCLE = DEMO_SLATE_CYCLE_MS;

/** A time at the given fraction through the first slate cycle. */
const at = (fraction: number) => Math.round(fraction * CYCLE);

const allPlayers = (teams: Team[]): Player[] =>
  teams.flatMap((team) => [...team.players, ...team.opponent.players]);

describe('generateDemoTeams', () => {
  it('is deterministic for a given time', () => {
    const a = generateDemoTeams(at(0.3));
    const b = generateDemoTeams(at(0.3));
    expect(a).toEqual(b);
  });

  it('generates the requested number of matchups with full rosters', () => {
    const teams = generateDemoTeams(at(0.3), { teamCount: 8 });
    expect(teams).toHaveLength(8);

    for (const team of teams) {
      expect(team.opponent).toBeDefined();
      expect(team.players.length).toBeGreaterThan(0);
      expect(team.opponent.players.length).toBeGreaterThan(0);
      // Rosters have both starters and bench players.
      expect(team.players.some((p) => p.onBench)).toBe(true);
      expect(team.players.some((p) => !p.onBench)).toBe(true);
    }
  });

  it('defaults to 10 teams', () => {
    expect(generateDemoTeams(at(0.3))).toHaveLength(10);
  });

  it('produces a live-Sunday mix of pregame, in-progress and final games', () => {
    // 0.65: early games are final, late games live, night game still pregame.
    const players = allPlayers(generateDemoTeams(at(0.65)));
    const statuses = new Set(players.map((p) => p.gameStatus));
    expect(statuses.has('in_progress')).toBe(true);
    expect(statuses.has('pregame')).toBe(true);
    expect(statuses.has('final')).toBe(true);
  });

  it('never lets a score go down as the slate progresses (monotonic)', () => {
    const earlier = allPlayers(generateDemoTeams(at(0.3)));
    const later = allPlayers(generateDemoTeams(at(0.45)));

    const laterById = new Map(later.map((p) => [p.id, p]));
    let sawIncrease = false;

    for (const before of earlier) {
      const after = laterById.get(before.id);
      if (!after) continue;
      expect(after.score).toBeGreaterThanOrEqual(before.score - 1e-9);
      if (after.score > before.score + 1e-9) {
        sawIncrease = true;
      }
    }

    // Something must have moved between the two polls.
    expect(sawIncrease).toBe(true);
  });

  it('reuses star players across teams so share counts populate', () => {
    const players = allPlayers(generateDemoTeams(at(0.3)));
    const maxUserShare = Math.max(...players.map((p) => p.onUserTeams));
    expect(maxUserShare).toBeGreaterThan(1);
  });

  it('sets a team total equal to the sum of its starters', () => {
    const [team] = generateDemoTeams(at(0.4));
    const starterSum = team.players
      .filter((p) => !p.onBench)
      .reduce((acc, p) => acc + p.score, 0);
    expect(team.totalScore).toBeCloseTo(Math.round(starterSum * 10) / 10, 5);
  });

  it('shapes pregame, in-progress and final players correctly', () => {
    const players = allPlayers(generateDemoTeams(at(0.65)));

    const pregame = players.find((p) => p.gameStatus === 'pregame');
    expect(pregame).toBeDefined();
    expect(pregame!.score).toBe(0);
    expect(pregame!.gameStartTime).not.toBeNull();
    expect(Number.isNaN(new Date(pregame!.gameStartTime as string).getTime())).toBe(false);

    const live = players.find((p) => p.gameStatus === 'in_progress');
    expect(live).toBeDefined();
    expect(live!.gameQuarter).toMatch(/^Q[1-4]$/);
    expect(live!.gameClock).toMatch(/^\d{1,2}:\d{2}$/);

    const final = players.find((p) => p.gameStatus === 'final');
    expect(final).toBeDefined();
    expect(final!.gameQuarter).toBe('Final');

    for (const player of players) {
      expect(player.imageUrl).toBeTruthy();
      expect(player.score).toBeGreaterThanOrEqual(0);
    }
  });

  it('loops scoring each cycle so demo mode keeps running', () => {
    // Scores, clocks and game states repeat every cycle; only pregame
    // kickoff timestamps (real wall-clock times) advance, so compare the
    // things that drive the live scoreboard.
    const scoringShape = (teams: Team[]) =>
      allPlayers(teams).map((p) => ({
        id: p.id,
        score: p.score,
        gameStatus: p.gameStatus,
        gameQuarter: p.gameQuarter,
        gameClock: p.gameClock,
      }));

    const firstCycle = scoringShape(generateDemoTeams(at(0.3)));
    const secondCycle = scoringShape(generateDemoTeams(CYCLE + at(0.3)));
    expect(secondCycle).toEqual(firstCycle);
  });
});
