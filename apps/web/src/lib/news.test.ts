import {
  annotateNewsItem,
  buildNewsDigest,
  buildSearchText,
  collectRosterPlayers,
  decodeEntities,
  generateDemoNewsItems,
  generateDemoTeams,
  normalizeNewsName,
  parseFeedDate,
  parseNewsFeed,
  parseNewsTitle,
} from '@roster-loom/core';
import type { NewsItem, Player, Team } from '@roster-loom/core';

const makePlayer = (
  overrides: Partial<Player> & Pick<Player, 'name'>,
): Player => ({
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

const makeTeam = (overrides: Partial<Team> & Pick<Team, 'name'>): Team => ({
  id: 1,
  totalScore: 0,
  players: [],
  opponent: { name: 'Them', totalScore: 0, players: [] },
  ...overrides,
});

const makeItem = (overrides: Partial<NewsItem> & Pick<NewsItem, 'guid' | 'title'>): NewsItem =>
  annotateNewsItem({
    link: null,
    description: '',
    publishedAt: '2026-09-10T12:00:00.000Z',
    author: null,
    categories: [],
    ...overrides,
  });

describe('normalizeNewsName', () => {
  it('folds case, punctuation and diacritics', () => {
    expect(normalizeNewsName("Ja'Marr Chase")).toBe('ja marr chase');
    expect(normalizeNewsName('Amon-Ra St. Brown')).toBe('amon ra st brown');
    expect(normalizeNewsName('José Ramírez')).toBe('jose ramirez');
  });

  it('drops generational suffixes so both spellings match', () => {
    expect(normalizeNewsName('Odell Beckham Jr.')).toBe('odell beckham');
    expect(normalizeNewsName('Odell Beckham')).toBe('odell beckham');
    expect(normalizeNewsName('Marvin Harrison Jr')).toBe('marvin harrison');
  });

  it('keeps a lone suffix-looking token rather than emptying the name', () => {
    expect(normalizeNewsName('V')).toBe('v');
  });

  it('returns an empty string for unusable input', () => {
    expect(normalizeNewsName('')).toBe('');
    expect(normalizeNewsName('   ')).toBe('');
    expect(normalizeNewsName(undefined as unknown as string)).toBe('');
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('Smith &amp; Jones')).toBe('Smith & Jones');
    expect(decodeEntities('a &#8212; b')).toBe('a — b');
    expect(decodeEntities('a &#x2014; b')).toBe('a — b');
  });

  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&notanentity;')).toBe('&notanentity;');
  });
});

describe('parseFeedDate', () => {
  it('parses RFC 822 dates to ISO', () => {
    expect(parseFeedDate('Thu, 10 Sep 2026 14:03:00 +0000')).toBe(
      '2026-09-10T14:03:00.000Z',
    );
  });

  it('returns null for missing or unparseable dates', () => {
    expect(parseFeedDate(null)).toBeNull();
    expect(parseFeedDate('not a date')).toBeNull();
  });
});

describe('parseNewsFeed', () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Rotowire NFL News</title>
    <item>
      <title><![CDATA[Jonathan Taylor - RB - IND: Practices fully Wednesday]]></title>
      <link>https://www.rotowire.com/football/news/taylor-1</link>
      <description><![CDATA[<p>Taylor (ankle) was a <b>full</b> participant Wednesday.</p>]]></description>
      <pubDate>Wed, 09 Sep 2026 18:30:00 +0000</pubDate>
      <guid isPermaLink="false">rotowire-1</guid>
      <category>NFL</category>
      <category>Injury</category>
    </item>
    <item>
      <title>Ja&amp;#039;Marr Chase - WR - CIN: Leads team in targets</title>
      <link>https://www.rotowire.com/football/news/chase-2</link>
      <description>Chase drew 12 targets in the win.</description>
      <pubDate>Wed, 09 Sep 2026 20:00:00 +0000</pubDate>
      <guid>rotowire-2</guid>
    </item>
    <item>
      <description>No title, so nothing to show.</description>
      <guid>rotowire-3</guid>
    </item>
  </channel>
</rss>`;

  it('extracts the items it can use', () => {
    const items = parseNewsFeed(feed);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      guid: 'rotowire-1',
      title: 'Jonathan Taylor - RB - IND: Practices fully Wednesday',
      link: 'https://www.rotowire.com/football/news/taylor-1',
      publishedAt: '2026-09-09T18:30:00.000Z',
      categories: ['NFL', 'Injury'],
    });
  });

  it('unwraps CDATA and strips HTML out of descriptions', () => {
    const [first] = parseNewsFeed(feed);
    expect(first.description).toBe('Taylor (ankle) was a full participant Wednesday.');
  });

  it('drops items with no title', () => {
    expect(parseNewsFeed(feed).map((item) => item.guid)).not.toContain('rotowire-3');
  });

  it('falls back to the link when an item carries no guid', () => {
    const [item] = parseNewsFeed(
      '<rss><item><title>A headline</title><link>https://example.com/a</link></item></rss>',
    );
    expect(item.guid).toBe('https://example.com/a');
  });

  it('reads Atom entries too', () => {
    const [item] = parseNewsFeed(`<feed>
      <entry>
        <title>Bijan Robinson - RB - ATL: Tops 100 yards</title>
        <link rel="alternate" href="https://example.com/bijan"/>
        <id>atom-1</id>
        <summary>Robinson ran for 118 yards.</summary>
        <published>2026-09-08T17:00:00Z</published>
      </entry>
    </feed>`);

    expect(item).toMatchObject({
      guid: 'atom-1',
      link: 'https://example.com/bijan',
      description: 'Robinson ran for 118 yards.',
      publishedAt: '2026-09-08T17:00:00.000Z',
    });
  });

  it('returns nothing rather than throwing on junk input', () => {
    expect(parseNewsFeed('')).toEqual([]);
    expect(parseNewsFeed('<html><body>not a feed</body></html>')).toEqual([]);
    expect(parseNewsFeed(null as unknown as string)).toEqual([]);
  });
});

describe('parseNewsTitle', () => {
  it('reads the "Name - POS - TEAM: headline" shape', () => {
    expect(parseNewsTitle('Jonathan Taylor - RB - IND: Practices fully Wednesday')).toEqual({
      playerName: 'Jonathan Taylor',
      position: 'RB',
      nflTeam: 'IND',
      headline: 'Practices fully Wednesday',
    });
  });

  it('handles the same shape with no trailing headline', () => {
    expect(parseNewsTitle('Travis Kelce - TE - KC')).toMatchObject({
      playerName: 'Travis Kelce',
      position: 'TE',
      nflTeam: 'KC',
      headline: 'Travis Kelce - TE - KC',
    });
  });

  it('reads a plain "Name: headline"', () => {
    expect(parseNewsTitle('Puka Nacua: Returns to practice')).toMatchObject({
      playerName: 'Puka Nacua',
      position: null,
      headline: 'Returns to practice',
    });
  });

  it('does not mistake a section label for a player', () => {
    expect(parseNewsTitle('Week 2 waiver wire: Five adds')).toMatchObject({
      playerName: null,
      headline: 'Week 2 waiver wire: Five adds',
    });
  });

  it('rejects a middle segment that is not a real position', () => {
    expect(parseNewsTitle('Some Guy - Zed - XYZ: Something happened')).toMatchObject({
      playerName: null,
    });
  });

  it('keeps the whole title as the headline when no player is named', () => {
    expect(parseNewsTitle('Injury report roundup')).toEqual({
      playerName: null,
      position: null,
      nflTeam: null,
      headline: 'Injury report roundup',
    });
  });
});

describe('buildSearchText', () => {
  it('pads the normalized text so a lookup is a word-boundary test', () => {
    const text = buildSearchText('Josh Allen throws', 'Allender did not play.');
    expect(text).toBe(' josh allen throws allender did not play ');
    expect(text.includes(' josh allen ')).toBe(true);
    expect(text.includes(' allender ')).toBe(true);
  });

  it('returns an empty string when there is nothing to index', () => {
    expect(buildSearchText('', '')).toBe('');
  });
});

describe('collectRosterPlayers', () => {
  const teams: Team[] = [
    makeTeam({
      name: 'Team A',
      league: { provider: 'sleeper', providerLeagueId: 'l1', name: 'League One' },
      players: [makePlayer({ name: 'Josh Allen', position: 'QB', realTeam: 'BUF' })],
      opponent: {
        name: 'Rival',
        totalScore: 0,
        players: [makePlayer({ name: 'Derrick Henry', realTeam: 'BAL', onOpponentTeams: 1 })],
      },
    }),
    makeTeam({
      name: 'Team B',
      league: { provider: 'yahoo', providerLeagueId: 'l2', name: 'League Two' },
      players: [makePlayer({ name: 'Josh Allen', position: 'QB', realTeam: 'BUF', onBench: true })],
    }),
  ];

  it('collapses a player rostered twice into one entry with both spots', () => {
    const players = collectRosterPlayers(teams);
    const allen = players.get('josh allen');

    expect(players.size).toBe(1);
    expect(allen?.rosteredIn).toEqual([
      { teamName: 'Team A', leagueName: 'League One', starting: true },
      { teamName: 'Team B', leagueName: 'League Two', starting: false },
    ]);
  });

  it('leaves opponents out unless asked for them', () => {
    expect(collectRosterPlayers(teams).has('derrick henry')).toBe(false);

    const withOpponents = collectRosterPlayers(teams, { includeOpponents: true });
    expect(withOpponents.get('derrick henry')).toMatchObject({
      opponentOnly: true,
      rosteredIn: [],
    });
  });

  it('skips players with no usable name', () => {
    const players = collectRosterPlayers([
      makeTeam({ name: 'T', players: [makePlayer({ name: '   ' })] }),
    ]);
    expect(players.size).toBe(0);
  });
});

describe('buildNewsDigest', () => {
  const teams: Team[] = [
    makeTeam({
      name: 'Team A',
      league: { provider: 'sleeper', providerLeagueId: 'l1', name: 'League One' },
      players: [
        makePlayer({ name: 'Jonathan Taylor', position: 'RB', realTeam: 'IND' }),
        makePlayer({ name: 'Tyreek Hill', realTeam: 'MIA', onBench: true }),
      ],
      opponent: {
        name: 'Rival',
        totalScore: 0,
        players: [makePlayer({ name: 'Derrick Henry', realTeam: 'BAL', onOpponentTeams: 1 })],
      },
    }),
  ];

  it('matches an item whose headline names a rostered player', () => {
    const digest = buildNewsDigest(
      [makeItem({ guid: 'a', title: 'Jonathan Taylor - RB - IND: Practices fully' })],
      teams,
    );

    expect(digest).toHaveLength(1);
    expect(digest[0]).toMatchObject({
      playerKey: 'jonathan taylor',
      playerName: 'Jonathan Taylor',
      opponentOnly: false,
    });
    expect(digest[0].items[0].matchedBy).toBe('player');
  });

  it('matches a rostered player named only in the body, as a weaker mention', () => {
    const digest = buildNewsDigest(
      [
        makeItem({
          guid: 'b',
          title: 'Tyler Goodson - RB - IND: Starting Sunday',
          description: 'Goodson starts with Jonathan Taylor sidelined.',
        }),
      ],
      teams,
    );

    expect(digest).toHaveLength(1);
    expect(digest[0].items[0].matchedBy).toBe('mention');
  });

  it('prefers the headline match when an item both names and mentions a player', () => {
    const digest = buildNewsDigest(
      [
        makeItem({
          guid: 'c',
          title: 'Jonathan Taylor - RB - IND: Practices fully',
          description: 'Jonathan Taylor took every first-team rep.',
        }),
      ],
      teams,
    );

    expect(digest[0].items).toHaveLength(1);
    expect(digest[0].items[0].matchedBy).toBe('player');
  });

  it('ignores news about players nobody rosters', () => {
    const digest = buildNewsDigest(
      [makeItem({ guid: 'd', title: 'Some Rookie - WR - NYJ: Waived' })],
      teams,
    );

    expect(digest).toEqual([]);
  });

  it('leaves opponent players out unless asked for them', () => {
    const items = [makeItem({ guid: 'e', title: 'Derrick Henry - RB - BAL: Full practice' })];

    expect(buildNewsDigest(items, teams)).toEqual([]);
    expect(
      buildNewsDigest(items, teams, { includeOpponents: true })[0],
    ).toMatchObject({ playerKey: 'derrick henry', opponentOnly: true });
  });

  it('does not match a longer name that merely contains a rostered one', () => {
    const digest = buildNewsDigest(
      [
        makeItem({
          guid: 'f',
          title: 'Jonathan Taylors - RB - NYG: Signed',
          description: 'Jonathan Taylors joins the practice squad.',
        }),
      ],
      teams,
    );

    expect(digest).toEqual([]);
  });

  it('orders players by their freshest item and items newest first', () => {
    const digest = buildNewsDigest(
      [
        makeItem({
          guid: 'old',
          title: 'Jonathan Taylor - RB - IND: Limited Wednesday',
          publishedAt: '2026-09-08T12:00:00.000Z',
        }),
        makeItem({
          guid: 'new',
          title: 'Jonathan Taylor - RB - IND: Full Thursday',
          publishedAt: '2026-09-09T12:00:00.000Z',
        }),
        makeItem({
          guid: 'newest',
          title: 'Tyreek Hill - WR - MIA: Questionable',
          publishedAt: '2026-09-10T12:00:00.000Z',
        }),
      ],
      teams,
    );

    expect(digest.map((entry) => entry.playerName)).toEqual([
      'Tyreek Hill',
      'Jonathan Taylor',
    ]);
    expect(digest[1].items.map((item) => item.guid)).toEqual(['new', 'old']);
    expect(digest[1].latestPublishedAt).toBe('2026-09-09T12:00:00.000Z');
  });

  it('caps how many items a player carries', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      makeItem({
        guid: `item-${index}`,
        title: `Jonathan Taylor - RB - IND: Note ${index}`,
        publishedAt: `2026-09-0${index + 1}T12:00:00.000Z`,
      }),
    );

    expect(buildNewsDigest(items, teams)[0].items).toHaveLength(5);
    expect(buildNewsDigest(items, teams, { itemsPerPlayer: 2 })[0].items).toHaveLength(2);
  });

  it('returns nothing when the user has no teams', () => {
    expect(
      buildNewsDigest([makeItem({ guid: 'g', title: 'Anyone - RB - IND: News' })], []),
    ).toEqual([]);
  });
});

describe('generateDemoNewsItems', () => {
  const nowMs = Date.parse('2026-09-10T12:00:00.000Z');

  it('is deterministic for a given time', () => {
    expect(generateDemoNewsItems(nowMs)).toEqual(generateDemoNewsItems(nowMs));
  });

  it('produces items that match the demo rosters', () => {
    const items = generateDemoNewsItems(nowMs);
    const teams = generateDemoTeams(nowMs);

    expect(items.length).toBeGreaterThan(0);
    expect(buildNewsDigest(items, teams).length).toBeGreaterThan(0);
  });

  it('honors the requested item count', () => {
    expect(generateDemoNewsItems(nowMs, { count: 3 })).toHaveLength(3);
  });
});
