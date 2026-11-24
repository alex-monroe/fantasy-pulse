import {
  findYahooSettings,
  groupScoringForDisplay,
  inferScoringSettings,
  isScoringTrusted,
  ottoneuScoring,
  parseOttoneuPointsSystem,
  scoreLiveStats,
  translateEspnScoring,
  translateYahooScoring,
  type ScoringObservation,
} from '@roster-loom/core';

describe('parseOttoneuPointsSystem', () => {
  it.each([
    ['1.0 PPR', 1],
    ['0.5 PPR', 0.5],
    ['Half PPR', 0.5],
    ['0 PPR', 0],
    ['Standard', 0],
    ['PPR', 1],
  ])('reads %s', (text, expected) => {
    expect(parseOttoneuPointsSystem(text)).toBe(expected);
  });

  it('returns null for anything else', () => {
    expect(parseOttoneuPointsSystem('3WR Superflex+Flex')).toBeNull();
    expect(parseOttoneuPointsSystem('')).toBeNull();
    expect(parseOttoneuPointsSystem('0.75 PPR')).toBeNull();
  });

  it('builds the full Ottoneu scoring for a reception value', () => {
    const settings = ottoneuScoring(0.5);
    expect(settings.rec).toBe(0.5);
    expect(settings.pass_2pt).toBe(1);
    expect(settings.fgm_50_59).toBe(5);
    expect(ottoneuScoring(0).rec).toBeUndefined();
  });
});

describe('translateEspnScoring', () => {
  it('maps direct stats, tiered bonuses, slot overrides and kicks', () => {
    const { settings, unmapped } = translateEspnScoring([
      { statId: 3, points: 0.04 },
      { statId: 4, points: 6 },
      { statId: 20, points: -2 },
      { statId: 24, points: 0.1 },
      { statId: 53, points: 1, pointsOverrides: { '6': 1.5 } },
      { statId: 17, points: 2 },
      { statId: 18, points: 5 },
      { statId: 74, points: 5 },
      { statId: 201, points: 6 },
      { statId: 80, points: 3 },
      { statId: 76, points: -1 },
      { statId: 79, points: -1 },
      { statId: 82, points: -1 },
      { statId: 101, points: 6 },
      { statId: 155, points: 0 },
    ]);
    expect(settings).toMatchObject({
      pass_yd: 0.04,
      pass_td: 6,
      pass_int: -2,
      rush_yd: 0.1,
      rec: 1,
      bonus_rec_te: 0.5,
      bonus_pass_yd_300: 2,
      bonus_pass_yd_400: 3,
      fgm_50_59: 5,
      fgm_60p: 6,
      fgm_0_19: 3,
      fgm_30_39: 3,
      fgmiss: -1,
    });
    expect(unmapped).toEqual([{ label: 'Kickoff return TD', value: 6 }]);
  });

  it('reports overrides it cannot express', () => {
    const { unmapped } = translateEspnScoring([{ statId: 4, points: 4, pointsOverrides: { '0': 6 } }]);
    expect(unmapped[0].label).toMatch(/lineup slot 0 override/);
  });
});

describe('translateYahooScoring', () => {
  const payload = {
    fantasy_content: {
      league: [
        { league_key: '461.l.1' },
        {
          settings: [
            {
              stat_categories: {
                stats: [
                  { stat: { stat_id: 4, name: 'Passing Yards' } },
                  { stat: { stat_id: 5, name: 'Passing Touchdowns' } },
                  { stat: { stat_id: 11, name: 'Receptions' } },
                  { stat: { stat_id: 16, name: '2-Point Conversions' } },
                  { stat: { stat_id: 15, name: 'Return Touchdowns' } },
                  { stat: { stat_id: 24, name: 'Field Goals Missed 0-19 Yards' } },
                  { stat: { stat_id: 25, name: 'Field Goals Missed 20-29 Yards' } },
                  { stat: { stat_id: 26, name: 'Field Goals Missed 30-39 Yards' } },
                  { stat: { stat_id: 27, name: 'Field Goals Missed 40-49 Yards' } },
                  { stat: { stat_id: 28, name: 'Field Goals Missed 50+ Yards' } },
                ],
              },
              stat_modifiers: {
                stats: [
                  {
                    stat: {
                      stat_id: '4',
                      value: '0.04',
                      bonuses: [{ bonus: { target: '300', points: '3' } }, { bonus: { target: '350', points: '1' } }],
                    },
                  },
                  { stat: { stat_id: '5', value: '4' } },
                  { stat: { stat_id: '11', value: '0.5' } },
                  { stat: { stat_id: '16', value: '2' } },
                  { stat: { stat_id: '15', value: '6' } },
                  { stat: { stat_id: '24', value: '-1' } },
                  { stat: { stat_id: '25', value: '-1' } },
                  { stat: { stat_id: '26', value: '-1' } },
                  { stat: { stat_id: '27', value: '-1' } },
                  { stat: { stat_id: '28', value: '-1' } },
                ],
              },
            },
          ],
        },
      ],
    },
  };

  it('maps stat modifiers and bonuses through the league settings payload', () => {
    const { settings, unmapped } = translateYahooScoring(findYahooSettings(payload));
    expect(settings).toEqual({
      pass_yd: 0.04,
      bonus_pass_yd_300: 3,
      pass_td: 4,
      rec: 0.5,
      pass_2pt: 2,
      rush_2pt: 2,
      rec_2pt: 2,
      fgmiss: -1,
    });
    expect(unmapped).toEqual([
      { label: 'Passing Yards bonus at 350', value: 1 },
      { label: 'Return Touchdowns', value: 6 },
    ]);
  });

  it('refuses a stat id whose name disagrees with the known mapping', () => {
    const { settings, unmapped } = translateYahooScoring({
      stat_categories: { stats: [{ stat: { stat_id: 4, name: 'Something Else' } }] },
      stat_modifiers: { stats: [{ stat: { stat_id: 4, value: 1 } }] },
    });
    expect(settings).toEqual({});
    expect(unmapped).toEqual([{ label: 'Something Else', value: 1 }]);
  });
});

describe('isScoringTrusted', () => {
  it('trusts provider reads and good fits only', () => {
    expect(isScoringTrusted({ source: 'provider', settings: { rec: 1 }, unmapped: [] })).toBe(true);
    expect(isScoringTrusted({ source: 'unknown', settings: {}, unmapped: [] })).toBe(false);
    const fit = { sampleSize: 40, matchRate: 0.95, throughWeek: 5, assumed: [] };
    expect(isScoringTrusted({ source: 'inferred', settings: { rec: 1 }, unmapped: [], inference: fit })).toBe(true);
    expect(
      isScoringTrusted({ source: 'inferred', settings: { rec: 1 }, unmapped: [], inference: { ...fit, matchRate: 0.6 } })
    ).toBe(false);
    expect(
      isScoringTrusted({ source: 'inferred', settings: { rec: 1 }, unmapped: [], inference: { ...fit, sampleSize: 5 } })
    ).toBe(false);
  });
});

describe('groupScoringForDisplay', () => {
  it('groups known keys and puts the rest under Other', () => {
    const groups = groupScoringForDisplay({ pass_td: 4, rec: 1, xyz: 2, rush_yd: 0 });
    expect(groups.map((g) => g.group)).toEqual(['Passing', 'Receiving', 'Other']);
    expect(groups[2].rows).toEqual([{ key: 'xyz', label: 'xyz', value: 2 }]);
  });
});

describe('inferScoringSettings', () => {
  // A synthetic league: 1 PPR, 6-point passing TDs, INT -2, 0.5 TE premium.
  const truth = {
    pass_yd: 0.04,
    pass_td: 6,
    pass_int: -2,
    pass_2pt: 2,
    rush_yd: 0.1,
    rush_td: 6,
    rush_2pt: 2,
    rec: 1,
    rec_yd: 0.1,
    rec_td: 6,
    rec_2pt: 2,
    bonus_rec_te: 0.5,
    fum_lost: -2,
    fgm_0_19: 3,
    fgm_20_29: 3,
    fgm_30_39: 3,
    fgm_40_49: 4,
    fgm_50_59: 5,
    fgm_60p: 5,
    xpm: 1,
  };

  const lines: [string, Record<string, number>][] = [
    ['QB', { pass_yd: 287, pass_td: 2, pass_int: 1, rush_yd: 21 }],
    ['QB', { pass_yd: 198, pass_td: 1, rush_yd: 4 }],
    ['QB', { pass_yd: 241, pass_td: 3, pass_int: 2, rush_td: 1, rush_yd: 12 }],
    ['RB', { rush_yd: 88, rush_td: 1, rec: 3, rec_yd: 19 }],
    ['RB', { rush_yd: 54, rec: 5, rec_yd: 41 }],
    ['RB', { rush_yd: 112, rush_td: 2, rec: 1, rec_yd: 6, fum_lost: 1 }],
    ['WR', { rec: 7, rec_yd: 93, rec_td: 1 }],
    ['WR', { rec: 4, rec_yd: 38 }],
    ['WR', { rec: 9, rec_yd: 121, rec_td: 2 }],
    ['TE', { rec: 6, rec_yd: 55 }],
    ['TE', { rec: 3, rec_yd: 27, rec_td: 1 }],
    ['K', { fgm_30_39: 2, fgm_40_49: 1, xpm: 3 }],
    ['K', { fgm_20_29: 1, fgm_50_59: 1, xpm: 2 }],
  ];

  const observations: ScoringObservation[] = lines.map(([position, stats]) => ({
    position,
    stats,
    points: Math.round(scoreLiveStats(stats, truth, position) * 100) / 100,
  }));

  it('recovers the rules from player-weeks, starting from Yahoo defaults', () => {
    const result = inferScoringSettings('yahoo', observations, { throughWeek: 4 })!;
    expect(result.matchRate).toBe(1);
    expect(result.sampleSize).toBe(lines.length);
    expect(result.settings).toMatchObject({ rec: 1, pass_td: 6, pass_int: -2, bonus_rec_te: 0.5 });
    expect(result.throughWeek).toBe(4);
    expect(result.changed.map((c) => c.id)).toEqual(expect.arrayContaining(['rec', 'pass_td', 'pass_int', 'bonus_rec_te']));
    // Nobody threw for 300, so that bonus was never tested.
    expect(result.assumed).toContain('300+ yd passing game');
  });

  it('tolerates a stat correction without bending the fit', () => {
    const noisy = observations.map((o, i) => (i === 7 ? { ...o, points: o.points + 1.3 } : o));
    const result = inferScoringSettings('yahoo', noisy)!;
    expect(result.settings).toMatchObject({ rec: 1, pass_td: 6 });
    expect(result.matchRate).toBeCloseTo(12 / 13, 3);
  });

  it('only tunes receptions for Ottoneu', () => {
    const ottoneu = lines.map(([position, stats]) => ({
      position,
      stats,
      points: Math.round(scoreLiveStats(stats, ottoneuScoring(1), position) * 100) / 100,
    }));
    const result = inferScoringSettings('ottoneu', ottoneu)!;
    expect(result.settings.rec).toBe(1);
    expect(result.settings.pass_td).toBe(4);
    expect(result.matchRate).toBe(1);
  });

  it('skips defenses and empty lines, and returns the default with no data', () => {
    const result = inferScoringSettings('espn', [
      { position: 'DEF', stats: { sack: 3 }, points: 3 },
      { position: 'WR', stats: {}, points: 0 },
    ])!;
    expect(result.sampleSize).toBe(0);
    expect(result.matchRate).toBe(0);
    expect(result.settings.rec).toBe(1);
  });

  it('has no catalog for Sleeper (its settings are read directly)', () => {
    expect(inferScoringSettings('sleeper', observations)).toBeNull();
  });
});

describe('inferScoringSettings at season scale', () => {
  // A deterministic pseudo-random stream, so the test is stable.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const int = (max: number) => Math.floor(rand() * (max + 1));

  const truth = {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    pass_2pt: 2,
    rush_yd: 0.1,
    rush_td: 6,
    rush_2pt: 2,
    rec: 0.5,
    rec_yd: 0.1,
    rec_td: 6,
    rec_2pt: 2,
    fum_lost: -2,
    bonus_rec_yd_100: 3,
    bonus_rush_yd_100: 3,
    fgm_0_19: 3,
    fgm_20_29: 3,
    fgm_30_39: 3,
    fgm_40_49: 4,
    fgm_50_59: 5,
    fgm_60p: 5,
    fgmiss: -1,
    xpm: 1,
  };

  const statLine = (position: string): Record<string, number> => {
    switch (position) {
      case 'QB':
        return { pass_yd: 150 + int(250), pass_td: int(4), pass_int: int(2), rush_yd: int(40), rush_td: rand() < 0.1 ? 1 : 0 };
      case 'RB':
        return { rush_yd: int(140), rush_td: int(2), rec: int(6), rec_yd: int(60), fum_lost: rand() < 0.05 ? 1 : 0 };
      case 'K':
        return { fgm_30_39: int(2), fgm_40_49: int(1), fgm_50_59: rand() < 0.3 ? 1 : 0, fgmiss: rand() < 0.2 ? 1 : 0, xpm: int(4) };
      default:
        return { rec: int(10), rec_yd: int(150), rec_td: int(2) };
    }
  };

  const positions = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'K'];
  const observations: ScoringObservation[] = Array.from({ length: 320 }, (_, i) => {
    const position = positions[i % positions.length];
    const stats = statLine(position);
    const points = Math.round(scoreLiveStats(stats, truth, position) * 100) / 100;
    // A handful of stat corrections the weekly stats don't reflect.
    return { position, stats, points: i % 53 === 0 ? points + 2 : points };
  });

  it('recovers a bonus-scoring ESPN league from a season of player-weeks, quickly', () => {
    const started = Date.now();
    const result = inferScoringSettings('espn', observations, { throughWeek: 10 })!;
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result.settings).toMatchObject({
      rec: 0.5,
      pass_int: -2,
      bonus_rec_yd_100: 3,
      bonus_rush_yd_100: 3,
      fgmiss: -1,
    });
    expect(result.settings.bonus_pass_yd_300).toBeUndefined();
    expect(result.matchRate).toBeGreaterThan(0.97);
  });
});
