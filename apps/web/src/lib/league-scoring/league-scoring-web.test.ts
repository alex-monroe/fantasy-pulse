import type { SleeperProjection, Team } from '@roster-loom/core';
import { applyLeagueScoring } from './decorate';
import { createPoolMatcher } from './refresh';
import { isScoringStale, lastCompletedWeekFor, scoringKeyString, type StoredLeagueScoring } from './store';

jest.mock('@/app/integrations/yahoo/actions', () => ({}));
jest.mock('@/app/integrations/espn/actions', () => ({}));
jest.mock('@/app/integrations/ottoneu/actions', () => ({}));

const NOW = Date.parse('2026-11-23T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString();

describe('lastCompletedWeekFor', () => {
  it('is 0 pre-season and the week before the current one in season', () => {
    expect(lastCompletedWeekFor(undefined)).toBe(0);
    expect(lastCompletedWeekFor({ week: 1, season_type: 'pre' })).toBe(0);
    expect(lastCompletedWeekFor({ week: 1, season_type: 'regular' })).toBe(0);
    expect(lastCompletedWeekFor({ week: 12, season_type: 'regular' })).toBe(11);
    expect(lastCompletedWeekFor({ week: 2, season_type: 'post' })).toBe(18);
  });
});

describe('isScoringStale', () => {
  it('is stale when nothing is stored', () => {
    expect(isScoringStale(null, 5, NOW)).toBe(true);
  });

  it('re-reads provider settings daily', () => {
    const scoring = { source: 'provider' as const, settings: { rec: 1 }, unmapped: [] };
    expect(isScoringStale({ ...scoring, checkedAt: hoursAgo(3) }, 5, NOW)).toBe(false);
    expect(isScoringStale({ ...scoring, checkedAt: hoursAgo(25) }, 5, NOW)).toBe(true);
  });

  it('re-infers once a new week has finished', () => {
    const inferred = {
      source: 'inferred' as const,
      settings: { rec: 1 },
      unmapped: [],
      inference: { sampleSize: 40, matchRate: 0.97, throughWeek: 4, assumed: [] },
    };
    expect(isScoringStale({ ...inferred, checkedAt: hoursAgo(1) }, 4, NOW)).toBe(false);
    expect(isScoringStale({ ...inferred, checkedAt: hoursAgo(1) }, 5, NOW)).toBe(true);
    // Just checked: don't hammer the provider even with a new week.
    expect(isScoringStale({ ...inferred, checkedAt: new Date(NOW - 60 * 1000).toISOString() }, 5, NOW)).toBe(false);
  });

  it('retries unknown settings every few hours', () => {
    const unknown = { source: 'unknown' as const, settings: {}, unmapped: [] };
    expect(isScoringStale({ ...unknown, checkedAt: hoursAgo(2) }, 0, NOW)).toBe(false);
    expect(isScoringStale({ ...unknown, checkedAt: hoursAgo(7) }, 0, NOW)).toBe(true);
  });
});

describe('applyLeagueScoring', () => {
  const player = (id: string, sleeperId?: string) => ({
    id,
    name: id,
    position: 'WR',
    realTeam: 'KC',
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
    projectedPoints: 5,
    ...(sleeperId ? { sleeperId } : {}),
  });
  const team = (provider: 'yahoo' | 'sleeper', leagueId: string): Team => ({
    id: 1,
    name: 'Mine',
    league: { provider, providerLeagueId: leagueId, name: 'L', season: '2026' },
    totalScore: 0,
    players: [player('a', '100'), player('b')],
    opponent: { name: 'Them', totalScore: 0, players: [player('c', '100')] },
  });
  const projections = new Map<string, SleeperProjection>([
    ['100', { player_id: '100', stats: { rec: 6, rec_yd: 70 } } as unknown as SleeperProjection],
  ]);
  const stored = (scoring: Partial<StoredLeagueScoring>) => {
    const row: StoredLeagueScoring = {
      provider: 'yahoo',
      providerLeagueId: '461.l.1',
      season: '2026',
      source: 'provider',
      settings: { rec: 1, rec_yd: 0.1 },
      unmapped: [],
      checkedAt: hoursAgo(1),
      ...scoring,
    };
    return new Map([[scoringKeyString(row), row]]);
  };
  const options = { defaultSeason: '2026', lastCompletedWeek: 10, projections, now: NOW };

  it('sets trusted settings on the league and re-scores projections with them', () => {
    const [result] = applyLeagueScoring([team('yahoo', '461.l.1')], stored({}), options);
    expect(result.league?.scoringSettings).toEqual({ rec: 1, rec_yd: 0.1 });
    expect(result.league?.scoring).toMatchObject({ source: 'provider', trusted: true, stale: false });
    expect(result.players[0].projectedPoints).toBeCloseTo(13);
    // No Sleeper id: the stock projection stays.
    expect(result.players[1].projectedPoints).toBe(5);
    expect(result.opponent.players[0].projectedPoints).toBeCloseTo(13);
  });

  it('marks untrusted inferences without applying them', () => {
    const [result] = applyLeagueScoring(
      [team('yahoo', '461.l.1')],
      stored({ source: 'inferred', inference: { sampleSize: 30, matchRate: 0.5, throughWeek: 10, assumed: [] } }),
      options
    );
    expect(result.league?.scoringSettings).toBeUndefined();
    expect(result.league?.scoring).toMatchObject({ source: 'inferred', trusted: false, matchRate: 0.5 });
    expect(result.players[0].projectedPoints).toBe(5);
  });

  it('flags leagues with nothing stored as stale and unknown', () => {
    const [result] = applyLeagueScoring([team('yahoo', '461.l.9')], new Map(), options);
    expect(result.league?.scoring).toMatchObject({ source: 'unknown', trusted: false, stale: true });
  });

  it('marks Sleeper leagues as read from the provider', () => {
    const sleeper = team('sleeper', 'abc');
    sleeper.league!.scoringSettings = { rec: 1 };
    const [result] = applyLeagueScoring([sleeper], new Map(), options);
    expect(result.league?.scoring).toMatchObject({ source: 'provider', trusted: true, stale: false });
  });
});

describe('createPoolMatcher', () => {
  const match = createPoolMatcher({
    '1': { full_name: 'Josh Allen', position: 'QB', active: true },
    '2': { full_name: 'Josh Allen', position: 'LB', active: true },
    '3': { full_name: "Ja'Marr Chase", position: 'WR', active: true },
    '4': { full_name: 'Mike Williams', position: 'WR', active: true },
    '5': { full_name: 'Mike Williams', position: 'WR', active: false },
  });

  it('matches by normalized name, breaking ties by position and then activity', () => {
    expect(match('Josh Allen', 'QB')).toBe('1');
    expect(match('JaMarr Chase', null)).toBe('3');
    expect(match('Mike Williams', 'WR')).toBe('4');
  });

  it('refuses ambiguous or unknown names', () => {
    expect(match('Josh Allen', null)).toBeNull();
    expect(match('Nobody Here', 'WR')).toBeNull();
  });
});
