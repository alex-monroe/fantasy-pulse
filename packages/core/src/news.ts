/**
 * Player news: parsing a syndicated NFL news feed and matching its items
 * to the players a user actually rosters.
 *
 * Everything here is a pure transform over strings and `Team[]` — no
 * fetching, no Supabase, no DOM — so it lives in `@roster-loom/core`,
 * runs in both apps, and is cheap to test. The fetching and persistence
 * half lives in `apps/web/src/lib/news/`.
 *
 * The feed (Rotowire's NFL news RSS) is a public, source-controlled
 * document we do not own, so the parser is deliberately tolerant: it
 * pulls the RSS 2.0 elements it understands, ignores everything else,
 * and never throws on a malformed item. An item it cannot make sense of
 * is dropped, not fatal.
 */
import type { Team } from './types';

/** Name suffixes that carry no identity, stripped before matching. */
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/** The positions a feed item's headline may tag a player with. */
const KNOWN_POSITIONS = new Set([
  'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'OL', 'DL', 'LB', 'CB', 'S',
  'P', 'FB', 'EDGE', 'IDP',
]);

/** One `<item>` lifted verbatim out of the feed. */
export interface RawNewsItem {
  /** The feed's own id for the item — `<guid>`, falling back to the link. */
  guid: string;
  /** The item's `<title>`, entity-decoded. */
  title: string;
  /** The item's `<link>`, when present. */
  link: string | null;
  /** The item's `<description>`, entity-decoded with HTML tags stripped. */
  description: string;
  /** `<pubDate>` as an ISO 8601 string, or `null` when unparseable. */
  publishedAt: string | null;
  /** `<author>` / `<dc:creator>`, when present. */
  author: string | null;
  /** Every `<category>` on the item. */
  categories: string[];
}

/** A feed item after the player it is about has been teased out of it. */
export interface NewsItem extends RawNewsItem {
  /** The player the item is about, as the feed wrote their name. */
  playerName: string | null;
  /**
   * {@link normalizeNewsName} of `playerName` — the key a roster player
   * is matched against. `null` when no player could be identified.
   */
  playerKey: string | null;
  /** The position the headline tagged the player with, when it did. */
  position: string | null;
  /** The NFL team abbreviation the headline tagged, when it did. */
  nflTeam: string | null;
  /** The headline with the `Name - POS - TEAM:` prefix removed. */
  headline: string;
  /**
   * Normalized title + description, used to find players the headline
   * prefix did not name. Always lowercase, punctuation-free, and padded
   * with a leading and trailing space so a substring test is a word-
   * boundary test.
   */
  searchText: string;
}

/** A news item as it attaches to one player in the digest. */
export interface PlayerNewsItem {
  guid: string;
  title: string;
  headline: string;
  link: string | null;
  summary: string;
  publishedAt: string | null;
  author: string | null;
  /** How the item was tied to this player — see {@link NewsMatchKind}. */
  matchedBy: NewsMatchKind;
}

/**
 * How confidently an item was tied to a player.
 *
 * `player` means the feed itself named the player in the headline's
 * `Name - POS - TEAM:` prefix. `mention` means the name only turned up
 * in the body text, which is weaker — a player mentioned as the guy
 * somebody else is backing up, say.
 */
export type NewsMatchKind = 'player' | 'mention';

/** Where a player with news shows up across the user's leagues. */
export interface PlayerNewsRosterSpot {
  /** The user's team name in that league. */
  teamName: string;
  /** The league's display name, when the provider supplied one. */
  leagueName: string | null;
  /** Whether the player is in the starting lineup there. */
  starting: boolean;
}

/** One player and every feed item about them. */
export interface PlayerNewsDigest {
  /** {@link normalizeNewsName} of the player's name. */
  playerKey: string;
  /** The player's name as the roster spells it. */
  playerName: string;
  position: string;
  nflTeam: string;
  /** The player's headshot, carried over from the roster. */
  imageUrl: string;
  /** Leagues where the user rosters the player. */
  rosteredIn: PlayerNewsRosterSpot[];
  /** True when the player only appears on an opponent's roster. */
  opponentOnly: boolean;
  /** How many opposing teams roster the player. */
  onOpponentTeams: number;
  /** Items about the player, newest first. */
  items: PlayerNewsItem[];
  /** The timestamp of the newest item, used to order the digest. */
  latestPublishedAt: string | null;
}

/**
 * Normalizes a player name to the form both sides of the match use:
 * diacritics folded, punctuation dropped, lowercased, whitespace
 * collapsed, and trailing generational suffixes removed.
 *
 * Mirrors `normalizePlayerName`/`sanitizePlayerName` in
 * `apps/web/src/app/actions.ts`, which resolve provider names to Sleeper
 * ids the same way. Keep the two in step.
 *
 * @param name - A player name from a feed item or a roster.
 * @returns The normalized name, or an empty string when nothing is left.
 */
export function normalizeNewsName(name: string): string {
  if (typeof name !== 'string') {
    return '';
  }

  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) {
    return '';
  }

  const tokens = base.split(' ');
  while (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(' ');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

/**
 * Decodes the XML/HTML entities a feed is allowed to use, including
 * numeric ones. Unknown entities are left alone rather than mangled.
 *
 * @param value - Raw text from the feed.
 * @returns The decoded text.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Strips markup and CDATA wrappers from a feed field and normalizes its
 * whitespace. Feed descriptions routinely carry escaped HTML.
 *
 * @param value - Raw element content.
 * @returns Plain text.
 */
function toPlainText(value: string): string {
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Decode first: the HTML inside a description arrives entity-escaped,
  // so the tags only become strippable once the entities are resolved.
  const decoded = decodeEntities(withoutCdata);
  return decodeEntities(decoded.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads the text of the first occurrence of an element inside a chunk of
 * XML. Namespaced names (`dc:creator`) are matched literally.
 *
 * @param xml - The XML fragment to search.
 * @param tag - The element name.
 * @returns The element's plain-text content, or `null` when absent.
 */
function readTag(xml: string, tag: string): string | null {
  const pattern = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    'i',
  );
  const match = pattern.exec(xml);
  if (!match) {
    return null;
  }

  const text = toPlainText(match[1]);
  return text.length > 0 ? text : null;
}

/**
 * Reads the text of every occurrence of an element inside a chunk of XML.
 *
 * @param xml - The XML fragment to search.
 * @param tag - The element name.
 * @returns Each element's plain-text content, in document order.
 */
function readAllTags(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    'gi',
  );
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const text = toPlainText(match[1]);
    if (text) {
      values.push(text);
    }
  }
  return values;
}

/**
 * Parses a feed date into an ISO 8601 string.
 *
 * RSS uses RFC 822 dates (`Thu, 11 Sep 2026 14:03:00 -0400`), which
 * `Date` handles; Atom uses ISO, which it also handles. Anything it
 * cannot read becomes `null` rather than an Invalid Date.
 *
 * @param value - The raw date text.
 * @returns An ISO timestamp, or `null`.
 */
export function parseFeedDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

/**
 * Pulls every `<item>` (RSS) or `<entry>` (Atom) out of a feed document.
 *
 * Tolerant by design: an item with neither a guid nor a link cannot be
 * de-duplicated on later ingests, and one with no title has nothing to
 * show, so both are dropped. Malformed XML around an item does not stop
 * the items that parse.
 *
 * @param xml - The raw feed body.
 * @returns The items the document yielded, in feed order.
 */
export function parseNewsFeed(xml: string): RawNewsItem[] {
  if (typeof xml !== 'string' || xml.length === 0) {
    return [];
  }

  const items: RawNewsItem[] = [];
  const blockPattern = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(xml)) !== null) {
    const block = match[2];

    const title = readTag(block, 'title');
    if (!title) {
      continue;
    }

    // Atom puts the URL in an attribute; RSS puts it in the element body.
    const link =
      readTag(block, 'link') ??
      /<link\b[^>]*href=["']([^"']+)["']/i.exec(block)?.[1] ??
      null;

    const guid = readTag(block, 'guid') ?? readTag(block, 'id') ?? link;
    if (!guid) {
      continue;
    }

    items.push({
      guid,
      title,
      link,
      description:
        readTag(block, 'description') ??
        readTag(block, 'content:encoded') ??
        readTag(block, 'summary') ??
        readTag(block, 'content') ??
        '',
      publishedAt: parseFeedDate(
        readTag(block, 'pubDate') ??
          readTag(block, 'published') ??
          readTag(block, 'updated') ??
          readTag(block, 'dc:date'),
      ),
      author: readTag(block, 'author') ?? readTag(block, 'dc:creator'),
      categories: readAllTags(block, 'category'),
    });
  }

  return items;
}

/** What a headline's leading `Name - POS - TEAM:` prefix yielded. */
interface TitleParts {
  playerName: string | null;
  position: string | null;
  nflTeam: string | null;
  headline: string;
}

/**
 * Teases the player out of a feed headline.
 *
 * The feed is not contractually obliged to use any particular shape, so
 * this recognizes the ones that turn up in practice and otherwise says
 * "no player here" rather than guessing:
 *
 * - `Jonathan Taylor - RB - IND: Practices fully Wednesday`
 * - `Jonathan Taylor - RB - IND`
 * - `Jonathan Taylor: Practices fully Wednesday`
 *
 * A headline that names nobody still reaches the digest through
 * {@link buildNewsDigest}'s body-text scan, just as a weaker `mention`.
 *
 * @param title - The item's title.
 * @returns The player, position, team and remaining headline.
 */
export function parseNewsTitle(title: string): TitleParts {
  const empty: TitleParts = {
    playerName: null,
    position: null,
    nflTeam: null,
    headline: title.trim(),
  };

  if (typeof title !== 'string' || !title.trim()) {
    return { ...empty, headline: '' };
  }

  const trimmed = title.trim();

  // `Name - POS - TEAM: headline`, with the tail optional. The dash may
  // be a hyphen, en dash or em dash.
  const tagged =
    /^([^-–—:]{2,60}?)\s*[-–—]\s*([A-Za-z]{1,5})\s*[-–—]\s*([A-Za-z]{2,4})\s*(?::\s*([\s\S]*))?$/.exec(
      trimmed,
    );

  if (tagged) {
    const position = tagged[2].toUpperCase();
    if (KNOWN_POSITIONS.has(position)) {
      return {
        playerName: tagged[1].trim(),
        position,
        nflTeam: tagged[3].toUpperCase(),
        headline: (tagged[4] ?? '').trim() || trimmed,
      };
    }
  }

  // `Name: headline` — only when the part before the colon looks like a
  // name (two or three capitalized words) rather than a section label.
  const colon = /^([^:]{2,60}):\s*([\s\S]+)$/.exec(trimmed);
  if (colon && looksLikePersonName(colon[1])) {
    return {
      playerName: colon[1].trim(),
      position: null,
      nflTeam: null,
      headline: colon[2].trim(),
    };
  }

  return empty;
}

/**
 * Whether a string reads as a person's name: two to four words, each
 * starting with a capital letter or a digit-free initial.
 *
 * @param value - The candidate text.
 * @returns True when the text looks like a name.
 */
function looksLikePersonName(value: string): boolean {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) {
    return false;
  }

  return tokens.every((token) => /^[A-Z][A-Za-z'.’-]*$/.test(token));
}

/**
 * Turns a raw feed item into one annotated with the player it is about.
 *
 * @param raw - The item as parsed from the feed.
 * @returns The annotated item.
 */
export function annotateNewsItem(raw: RawNewsItem): NewsItem {
  const parts = parseNewsTitle(raw.title);
  const playerKey = parts.playerName ? normalizeNewsName(parts.playerName) : '';

  return {
    ...raw,
    playerName: playerKey ? parts.playerName : null,
    playerKey: playerKey || null,
    position: parts.position,
    nflTeam: parts.nflTeam,
    headline: parts.headline,
    searchText: buildSearchText(raw.title, raw.description),
  };
}

/**
 * Builds the padded, normalized haystack an item is scanned with.
 *
 * The padding matters: `` ` ${text} ` ``.includes(` ${name} `) is a
 * word-boundary test, which keeps "Josh Allen" out of a story about
 * "Josh Allender" and keeps a two-word name from matching across a
 * sentence break.
 *
 * @param title - The item's title.
 * @param description - The item's body text.
 * @returns The normalized haystack, space-padded on both ends.
 */
export function buildSearchText(title: string, description: string): string {
  const normalized = `${title ?? ''} ${description ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized ? ` ${normalized} ` : '';
}

/** A player the digest should look for news about. */
export interface DigestRosterPlayer {
  playerKey: string;
  playerName: string;
  position: string;
  nflTeam: string;
  imageUrl: string;
  rosteredIn: PlayerNewsRosterSpot[];
  onOpponentTeams: number;
  /** True when no team of the user's rosters the player. */
  opponentOnly: boolean;
}

/**
 * Collects every player the user rosters across all their teams, plus —
 * when asked — the players their opponents roster this week.
 *
 * A player on two of the user's teams collapses into one entry carrying
 * both roster spots, which is what the digest renders.
 *
 * @param teams - The user's teams, as `getTeams` builds them.
 * @param options.includeOpponents - Also collect opponents' rosters.
 * @returns One entry per distinct player, keyed by normalized name.
 */
export function collectRosterPlayers(
  teams: Team[],
  options: { includeOpponents?: boolean } = {},
): Map<string, DigestRosterPlayer> {
  const players = new Map<string, DigestRosterPlayer>();

  const add = (
    player: { name: string; position: string; realTeam: string; imageUrl: string; onBench: boolean; onOpponentTeams?: number },
    spot: PlayerNewsRosterSpot | null,
  ) => {
    const playerKey = normalizeNewsName(player?.name ?? '');
    if (!playerKey) {
      return;
    }

    const existing = players.get(playerKey);
    if (existing) {
      if (spot) {
        existing.rosteredIn.push(spot);
        existing.opponentOnly = false;
      }
      existing.onOpponentTeams = Math.max(
        existing.onOpponentTeams,
        player.onOpponentTeams ?? 0,
      );
      return;
    }

    players.set(playerKey, {
      playerKey,
      playerName: player.name,
      position: player.position ?? '',
      nflTeam: player.realTeam ?? '',
      imageUrl: player.imageUrl ?? '',
      rosteredIn: spot ? [spot] : [],
      onOpponentTeams: player.onOpponentTeams ?? 0,
      opponentOnly: !spot,
    });
  };

  for (const team of teams ?? []) {
    const leagueName = team?.league?.name ?? null;

    for (const player of team?.players ?? []) {
      add(player, {
        teamName: team.name,
        leagueName,
        starting: !player.onBench,
      });
    }

    if (options.includeOpponents) {
      for (const player of team?.opponent?.players ?? []) {
        add(player, null);
      }
    }
  }

  return players;
}

/** Options for {@link buildNewsDigest}. */
export interface BuildNewsDigestOptions {
  /** Also surface news about players the user's opponents roster. */
  includeOpponents?: boolean;
  /** Cap on how many items are kept per player. Default 5. */
  itemsPerPlayer?: number;
}

/**
 * Matches feed items to the players a user rosters.
 *
 * Each item is tied to a player two ways, strongest first: the headline
 * named them outright (`player`), or their name turned up in the item's
 * text (`mention`). The second catches the stories that matter without
 * naming the player in the headline — a backup's promotion, a target
 * share note — at the cost of the occasional passing reference, which is
 * why the two are labelled differently and the stronger one wins when
 * both apply.
 *
 * @param items - Annotated feed items, any order.
 * @param teams - The user's teams.
 * @param options - See {@link BuildNewsDigestOptions}.
 * @returns One entry per player with news, newest news first.
 */
export function buildNewsDigest(
  items: NewsItem[],
  teams: Team[],
  options: BuildNewsDigestOptions = {},
): PlayerNewsDigest[] {
  const itemsPerPlayer = options.itemsPerPlayer ?? 5;
  const rosterPlayers = collectRosterPlayers(teams, {
    includeOpponents: options.includeOpponents,
  });

  if (rosterPlayers.size === 0) {
    return [];
  }

  // Matched items per player, de-duplicated by guid so an item that both
  // names a player and mentions them again in the body lands once.
  const matches = new Map<string, Map<string, PlayerNewsItem>>();

  const record = (playerKey: string, item: NewsItem, matchedBy: NewsMatchKind) => {
    let byGuid = matches.get(playerKey);
    if (!byGuid) {
      byGuid = new Map();
      matches.set(playerKey, byGuid);
    }

    const existing = byGuid.get(item.guid);
    if (existing) {
      // A headline match outranks a body mention.
      if (existing.matchedBy === 'mention' && matchedBy === 'player') {
        existing.matchedBy = 'player';
      }
      return;
    }

    byGuid.set(item.guid, {
      guid: item.guid,
      title: item.title,
      headline: item.headline,
      link: item.link,
      summary: item.description,
      publishedAt: item.publishedAt,
      author: item.author,
      matchedBy,
    });
  };

  // Scanning every item against every rostered player is quadratic, and
  // a user with a dozen leagues rosters a few hundred players. Index the
  // players by their surname first so each item only tests the handful of
  // names its own words could possibly match.
  const bySurname = indexBySurname(rosterPlayers.keys());

  for (const item of items ?? []) {
    if (!item) {
      continue;
    }

    if (item.playerKey && rosterPlayers.has(item.playerKey)) {
      record(item.playerKey, item, 'player');
    }

    if (!item.searchText) {
      continue;
    }

    const words = new Set(item.searchText.trim().split(' '));
    const candidates = new Set<string>();
    for (const word of words) {
      const keys = bySurname.get(word);
      if (keys) {
        for (const key of keys) {
          candidates.add(key);
        }
      }
    }

    for (const playerKey of candidates) {
      if (item.searchText.includes(` ${playerKey} `)) {
        record(playerKey, item, item.playerKey === playerKey ? 'player' : 'mention');
      }
    }
  }

  const digest: PlayerNewsDigest[] = [];

  for (const [playerKey, byGuid] of matches) {
    const player = rosterPlayers.get(playerKey);
    if (!player) {
      continue;
    }

    const sorted = Array.from(byGuid.values()).sort(compareByPublishedDesc);

    digest.push({
      playerKey,
      playerName: player.playerName,
      position: player.position,
      nflTeam: player.nflTeam,
      imageUrl: player.imageUrl,
      rosteredIn: player.rosteredIn,
      opponentOnly: player.opponentOnly,
      onOpponentTeams: player.onOpponentTeams,
      items: sorted.slice(0, itemsPerPlayer),
      latestPublishedAt: sorted[0]?.publishedAt ?? null,
    });
  }

  return digest.sort((a, b) => {
    const byDate = compareTimestampsDesc(a.latestPublishedAt, b.latestPublishedAt);
    return byDate !== 0 ? byDate : a.playerName.localeCompare(b.playerName);
  });
}

function compareByPublishedDesc(a: PlayerNewsItem, b: PlayerNewsItem): number {
  return compareTimestampsDesc(a.publishedAt, b.publishedAt);
}

/** Orders two ISO timestamps newest first, sorting `null` last. */
function compareTimestampsDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
}

/**
 * Groups normalized player keys by their last word (the surname), so an
 * item's own words can nominate the few players worth a full-name test.
 *
 * @param playerKeys - Normalized player names.
 * @returns Surname -> the player keys ending in it.
 */
function indexBySurname(playerKeys: Iterable<string>): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const playerKey of playerKeys) {
    const tokens = playerKey.split(' ');
    const surname = tokens[tokens.length - 1];
    if (!surname) {
      continue;
    }

    const existing = index.get(surname);
    if (existing) {
      existing.push(playerKey);
    } else {
      index.set(surname, [playerKey]);
    }
  }

  return index;
}
