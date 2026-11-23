import {
  STOCK_SCORING_SETTINGS,
  WORM_LINEUP_SD,
  WORM_STARTER_VARIANCE,
  applyLiveFeed,
  buildMatchupWorm,
  createLiveFeedContext,
  createLiveIdResolver,
  gameRemainingShare,
  getLiveProjectedPoints,
  isHeartbeatFresh,
  liveScoringFor,
  nflverseTeam,
  normalCdf,
  normalizeFeedName,
  playerStatTotals,
  projectMatchup,
  scoreLiveStats,
  wormWinProbability,
  type LiveFeed,
  type LiveFeedGame,
  type LiveFeedPlay,
  type Player,
  type Team,
  type WormStarter,
} from '@roster-loom/core';

const NOW = Date.parse('2026-11-22T19:30:00Z');

const game = (overrides: Partial<LiveFeedGame> = {}): LiveFeedGame => ({
  gameId: '2026_12_KC_BUF',
  homeTeam: 'BUF',
  awayTeam: 'KC',
  kickoff: '2026-11-22T18:00:00Z',
  state: 'in',
  elapsedSeconds: 1800,
  lengthSeconds: 3600,
  finished: false,
  lastPlayAt: '2026-11-22T19:25:00Z',
  ...overrides,
});

const play = (
  playId: number,
  playAt: string,
  elapsedSeconds: number | null,
  stats: LiveFeedPlay['stats'] = null,
  gameId = '2026_12_KC_BUF'
): LiveFeedPlay => ({ gameId, playId, playAt, elapsedSeconds, stats });

const player = (overrides: Partial<Player> = {}): Player => ({
  id: 'p1',
  name: 'Test Player',
  position: 'WR',
  realTeam: 'KC',
  score: 0,
  gameStatus: 'in_progress',
  gameStartTime: null,
  gameQuarter: 'Q2',
  gameClock: '0:00',
  onUserTeams: 1,
  onOpponentTeams: 0,
  gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
  imageUrl: '',
  onBench: false,
  ...overrides,
});

describe('the feed clock', () => {
  it('reads the share of a game still to play from its elapsed seconds', () => {
    expect(gameRemainingShare(game({ state: 'pre', elapsedSeconds: 0 }))).toBe(1);
    expect(gameRemainingShare(game({ elapsedSeconds: 900 }))).toBe(0.75);
    expect(gameRemainingShare(game({ state: 'post', finished: true }))).toBe(0);
    expect(gameRemainingShare(game({ finished: true, state: 'in' }))).toBe(0);
  });

  it('stretches the game into overtime rather than going negative', () => {
    expect(gameRemainingShare(game({ elapsedSeconds: 3900, lengthSeconds: 3900 }))).toBe(0);
    expect(gameRemainingShare(game({ elapsedSeconds: 3700, lengthSeconds: 3600 }))).toBe(0);
  });

  it('spells provider team codes the way nflverse does', () => {
    expect(nflverseTeam('LAR')).toBe('LA');
    expect(nflverseTeam('wsh')).toBe('WAS');
    expect(nflverseTeam('JAC')).toBe('JAX');
    expect(nflverseTeam('KC')).toBe('KC');
  });

  it('treats a heartbeat over three minutes old as stopped', () => {
    expect(isHeartbeatFresh('2026-11-22T19:29:00Z', NOW)).toBe(true);
    expect(isHeartbeatFresh('2026-11-22T19:26:00Z', NOW)).toBe(false);
    expect(isHeartbeatFresh(null, NOW)).toBe(false);
  });
});

describe('scoring live stats', () => {
  it('scores a stat line with Sleeper-keyed settings', () => {
    const half = STOCK_SCORING_SETTINGS.half_ppr;
    expect(scoreLiveStats({ rec: 5, rec_yd: 62, rec_td: 1 }, half, 'WR')).toBeCloseTo(14.7);
    expect(scoreLiveStats({ fgm_40_49: 1, xpm: 2, fgmiss: 1 }, half, 'K')).toBeCloseTo(5);
    expect(scoreLiveStats(undefined, half, 'WR')).toBe(0);
  });

  it('adds the milestone bonuses and tight-end premium Sleeper leagues score', () => {
    const settings = { rec: 1, rec_yd: 0.1, bonus_rec_yd_100: 3, bonus_rec_te: 0.5 };
    expect(scoreLiveStats({ rec: 6, rec_yd: 104 }, settings, 'WR')).toBeCloseTo(6 + 10.4 + 3);
    expect(scoreLiveStats({ rec: 6, rec_yd: 99 }, settings, 'TE')).toBeCloseTo(6 + 9.9 + 3);
  });

  it('adds up every play into each player’s totals', () => {
    const totals = playerStatTotals([
      play(1, '2026-11-22T18:05:00Z', 100, { a: { rush_yd: 7 } }),
      play(2, '2026-11-22T18:06:00Z', 130, { a: { rush_yd: 3, rush_td: 1 }, b: { pass_yd: 12 } }),
      play(3, '2026-11-22T18:07:00Z', 160),
    ]);
    expect(totals.get('a')).toEqual({ rush_yd: 10, rush_td: 1 });
    expect(totals.get('b')).toEqual({ pass_yd: 12 });
  });

  it('uses the league’s own settings when the provider gave them, a stock profile otherwise', () => {
    const own = { rec: 1 };
    expect(liveScoringFor({ provider: 'sleeper', providerLeagueId: '1', name: 'L', scoringSettings: own })).toEqual({
      settings: own,
      scoring: 'exact',
    });
    expect(liveScoringFor({ provider: 'yahoo', providerLeagueId: '2', name: 'Y' }).scoring).toBe('stock');
  });
});

describe('matching roster players to the feed', () => {
  const feedPlayers = [
    { gsisId: '00-1', espnId: '111', fullName: 'Marvin Harrison Jr.', position: 'WR', team: 'ARI' },
    { gsisId: '00-2', espnId: '222', fullName: 'Josh Allen', position: 'QB', team: 'BUF' },
    { gsisId: '00-3', espnId: '333', fullName: 'Josh Allen', position: 'LB', team: 'JAX' },
    { gsisId: '00-4', espnId: '444', fullName: "Ja'Marr Chase", position: 'WR', team: 'CIN' },
  ];

  it('normalizes names the way rosters spell them', () => {
    expect(normalizeFeedName('Marvin Harrison Jr.')).toBe('marvin harrison');
    expect(normalizeFeedName("Ja'Marr Chase")).toBe('jamarr chase');
  });

  it('joins Sleeper players through the pool’s gsis id, then its ESPN id', () => {
    const resolve = createLiveIdResolver(feedPlayers, {
      s1: { full_name: 'Somebody Else', gsis_id: '00-4' },
      s2: { full_name: 'Somebody Else', espn_id: 111 },
    });
    expect(resolve(player({ id: 's1', name: 'Somebody Else' }), 'sleeper')).toBe('00-4');
    expect(resolve(player({ id: 's2', name: 'Somebody Else' }), 'sleeper')).toBe('00-1');
  });

  it('falls back to name, breaking ties by NFL team then position', () => {
    const resolve = createLiveIdResolver(feedPlayers);
    expect(resolve(player({ name: 'Marvin Harrison', realTeam: 'ARI' }), 'yahoo')).toBe('00-1');
    expect(resolve(player({ name: 'Josh Allen', realTeam: 'BUF', position: 'QB' }), 'ottoneu')).toBe('00-2');
    expect(resolve(player({ name: 'Josh Allen', realTeam: 'FA', position: 'QB' }), 'espn')).toBe('00-2');
    expect(resolve(player({ name: 'Nobody Here' }), 'espn')).toBeNull();
  });

  it('never matches a defense', () => {
    const resolve = createLiveIdResolver(feedPlayers);
    expect(resolve(player({ name: 'Josh Allen', position: 'DEF' }), 'yahoo')).toBeNull();
  });
});

describe('the score worm', () => {
  const games = new Map([
    ['G1', game({ gameId: 'G1', homeTeam: 'BUF', awayTeam: 'KC', elapsedSeconds: 1800 })],
    ['G2', game({ gameId: 'G2', homeTeam: 'MIA', awayTeam: 'NE', state: 'pre', elapsedSeconds: 0, lastPlayAt: null })],
  ]);
  const starters: WormStarter[] = [
    { side: 'team', gsisId: 'wr', gameId: 'G1', projection: 12, name: "Ja'Marr Chase", position: 'WR' },
    { side: 'opponent', gsisId: 'rb', gameId: 'G1', projection: 15, name: 'Derrick Henry', position: 'RB' },
    { side: 'opponent', gsisId: 'qb', gameId: 'G2', projection: 20, name: 'Drake Maye', position: 'QB' },
  ];
  const plays = [
    play(1, '2026-11-22T18:01:00Z', 0, null, 'G1'),
    play(2, '2026-11-22T18:10:00Z', 600, { wr: { rec: 1, rec_yd: 40, rec_td: 1 } }, 'G1'),
    play(3, '2026-11-22T18:20:00Z', 900, { other: { rush_yd: 5 } }, 'G1'),
    play(4, '2026-11-22T18:30:00Z', 1800, { rb: { rush_yd: 22 } }, 'G1'),
  ];
  const worm = buildMatchupWorm(starters, plays, games, STOCK_SCORING_SETTINGS.half_ppr);

  it('starts at 0–0 with the pre-game odds, then one point per scoring play', () => {
    expect(worm.map((p) => p.note)).toEqual(['Kickoff', 'J. Chase +10.50', 'D. Henry +2.20']);
    expect(worm[0]).toMatchObject({ team: 0, opponent: 0, teamProgress: 0, teamRemaining: 12 });
    expect(worm[2]).toMatchObject({ team: 10.5, opponent: 2.2 });
  });

  it('carries each side’s minutes played and projection still to come', () => {
    // Chase's game is half over: half his projection is left.
    expect(worm[2].teamProgress).toBe(0.5);
    expect(worm[2].teamRemaining).toBe(6);
    // Henry's game is half over, Maye's hasn't started: 1800 of 7200 seconds played.
    expect(worm[2].opponentProgress).toBe(0.25);
    expect(worm[2].opponentRemaining).toBe(7.5 + 20);
  });

  it('is ottoneu-db’s win probability: the expected margin over the minutes left', () => {
    const last = worm[2];
    const margin = last.team + last.teamRemaining - (last.opponent + last.opponentRemaining);
    const variance = WORM_STARTER_VARIANCE * (0.5 + 0.5 + 1);
    expect(last.winProbability).toBeCloseTo(normalCdf(margin / Math.sqrt(variance)), 4);
  });

  it('reproduces ottoneu-db’s lineup spread for an eight-starter lineup', () => {
    // Eight starters a quarter of the way through: WORM_LINEUP_SD² × (1 − ¼).
    expect(8 * WORM_STARTER_VARIANCE * 0.75).toBeCloseTo(WORM_LINEUP_SD ** 2 * 0.75);
  });

  it('settles once every game is over', () => {
    expect(wormWinProbability(3, 0)).toBe(1);
    expect(wormWinProbability(-3, 0)).toBe(0);
    expect(wormWinProbability(0, 0)).toBe(0.5);
    const done = new Map([['G1', game({ gameId: 'G1', finished: true, state: 'post', elapsedSeconds: 3600 })]]);
    const final = buildMatchupWorm(starters.slice(0, 2), plays, done, STOCK_SCORING_SETTINGS.half_ppr);
    // G1's last play is its final one: the whole game has been played.
    expect(final[final.length - 1]).toMatchObject({ teamProgress: 1, opponentProgress: 1, winProbability: 1 });
  });

  it('is empty before anyone in the matchup scores', () => {
    expect(buildMatchupWorm(starters, plays.slice(0, 1), games, STOCK_SCORING_SETTINGS.half_ppr)).toEqual([]);
  });
});

describe('applyLiveFeed', () => {
  const feed = (heartbeatAt: string | null): LiveFeed => ({
    season: 2026,
    week: 12,
    heartbeatAt,
    games: [game({ elapsedSeconds: 2700 })],
    plays: [
      play(1, '2026-11-22T18:10:00Z', 600, { wr1: { rec: 2, rec_yd: 30 } }),
      play(2, '2026-11-22T19:20:00Z', 2700, { rb1: { rush_yd: 50, rush_td: 1 } }),
    ],
    players: [
      { gsisId: 'wr1', espnId: null, fullName: 'Mine Receiver', position: 'WR', team: 'KC' },
      { gsisId: 'rb1', espnId: null, fullName: 'Their Back', position: 'RB', team: 'BUF' },
    ],
  });

  const team = (scoringSettings?: Record<string, number>): Team => ({
    id: 1,
    name: 'Mine',
    league: {
      provider: scoringSettings ? 'sleeper' : 'yahoo',
      providerLeagueId: 'L',
      name: 'League',
      ...(scoringSettings ? { scoringSettings } : {}),
    },
    // The provider lags a play behind on each side.
    totalScore: 2,
    players: [
      player({ id: 'a', name: 'Mine Receiver', realTeam: 'KC', score: 2, projectedPoints: 12 }),
      player({ id: 'b', name: 'Bench Guy', realTeam: 'KC', score: 0, onBench: true, projectedPoints: 5 }),
      player({ id: 'c', name: 'Bye Week', realTeam: 'SEA', score: 0, projectedPoints: 9 }),
    ],
    opponent: {
      name: 'Theirs',
      totalScore: 5,
      players: [player({ id: 'd', name: 'Their Back', realTeam: 'BUF', position: 'RB', score: 5, projectedPoints: 14 })],
    },
  });

  const ppr = { rec: 1, rec_yd: 0.1, rush_yd: 0.1, rush_td: 6 };

  it('makes the feed’s play-by-play the headline where the league’s scoring is known', () => {
    const out = applyLiveFeed(team(ppr), createLiveFeedContext(feed('2026-11-22T19:29:30Z'), createLiveIdResolver(feed(null).players), { now: NOW }));
    expect(out.live).toMatchObject({ feedLive: true, scoring: 'exact', headlineFromFeed: true, official: { team: 2, opponent: 5 } });
    expect(out.players[0].score).toBe(5);
    expect(out.players[0].live).toMatchObject({ gsisId: 'wr1', points: 5, officialScore: 2, remainingShare: 0.25 });
    expect(out.totalScore).toBe(5);
    expect(out.opponent.totalScore).toBe(11);
    // A player whose NFL game isn't in the feed is left as the provider had him.
    expect(out.players[2].live).toBeUndefined();
    expect(out.live?.worm.map((p) => p.note)).toEqual(['Kickoff', 'M. Receiver +5.00', 'T. Back +11.00']);
  });

  it('keeps the provider’s scores as the headline where the scoring is only a stock guess', () => {
    const out = applyLiveFeed(team(), createLiveFeedContext(feed('2026-11-22T19:29:30Z'), createLiveIdResolver(feed(null).players), { now: NOW }));
    expect(out.live).toMatchObject({ scoring: 'stock', headlineFromFeed: false });
    expect(out.totalScore).toBe(2);
    expect(out.players[0].score).toBe(2);
    // ...but still gets the feed's clock and its own (stock) points.
    expect(out.players[0].live).toMatchObject({ points: 4, remainingShare: 0.25 });
  });

  it('falls back to the provider’s scores once the loop stops', () => {
    const out = applyLiveFeed(team(ppr), createLiveFeedContext(feed('2026-11-22T19:00:00Z'), createLiveIdResolver(feed(null).players), { now: NOW }));
    expect(out.live).toMatchObject({ feedLive: false, headlineFromFeed: false });
    expect(out.totalScore).toBe(2);
  });

  it('projects from the feed’s clock', () => {
    const out = applyLiveFeed(team(ppr), createLiveFeedContext(feed('2026-11-22T19:29:30Z'), createLiveIdResolver(feed(null).players), { now: NOW }));
    // 5 so far + 12 × the quarter of the game left; the provider's own
    // "Q2 0:00" clock would have said half.
    expect(getLiveProjectedPoints(out.players[0])).toBeCloseTo(8);
    const projection = projectMatchup(out);
    // Bye Week's game isn't in the feed, so his provider status (live, Q2
    // 0:00 → half left) still counts.
    expect(projection.team.remaining).toBeCloseTo(3 + 4.5);
    expect(projection.opponent.remaining).toBeCloseTo(3.5);
  });

  it('leaves a team alone when the feed has no games', () => {
    const empty = { ...feed(null), games: [] };
    const original = team(ppr);
    expect(applyLiveFeed(original, createLiveFeedContext(empty, createLiveIdResolver([])))).toBe(original);
  });
});
