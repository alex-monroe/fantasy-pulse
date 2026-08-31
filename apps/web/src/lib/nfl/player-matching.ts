/**
 * Matching a player name from Yahoo, Ottoneu or ESPN to a Sleeper player id.
 *
 * Only Sleeper exposes stable player ids. The other three providers give
 * names, so every non-Sleeper roster has to be reconciled by string
 * matching before projections or headshots can be attached.
 *
 * Pure and I/O-free, but it lives here rather than in `packages/core/`
 * because it depends on `string-similarity`, and adding a dependency to
 * the platform-neutral package for code the mobile app never calls would
 * be a bad trade.
 */
import { findBestMatch } from 'string-similarity';

export const SLEEPER_HEADSHOT_BASE_URL =
  'https://sleepercdn.com/content/nfl/players/thumb';
export const SLEEPER_DEFAULT_HEADSHOT_URL =
  'https://sleepercdn.com/images/v2/icons/player_default.webp';

export const IGNORED_ROSTER_SPOTS = new Set(['BN', 'BENCH', 'FLX', 'SFLX']);

export type SleeperIdResolver = (playerName: string) => string | null;

export const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

export const TEAM_ABBREVIATION_ALIASES: Record<string, string[]> = {
  WSH: ['WAS'],
  JAX: ['JAC'],
};

export function normalizePlayerName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function sanitizePlayerName(name: string) {
  return normalizePlayerName(name.replace(/[^a-z0-9\s]/gi, ' '));
}

export function normalizeOttoneuTeamName(name: string) {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function extractNameParts(name: string): { first: string; last: string } {
  const tokens = name.split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return { first: '', last: '' };
  }

  let end = tokens.length - 1;
  while (end >= 0 && NAME_SUFFIXES.has(tokens[end])) {
    end -= 1;
  }

  if (end < 0) {
    end = tokens.length - 1;
  }

  const meaningfulTokens = tokens.slice(0, end + 1);
  const last = tokens[end] ?? '';

  let first = meaningfulTokens[0] ?? '';
  if (first.length === 1 && meaningfulTokens.length > 1) {
    const second = meaningfulTokens[1];
    if (second && second.length === 1) {
      first = `${first}${second}`;
    }
  }

  return { first, last };
}

export function isStrongNameMatch({
  sourceName,
  targetName,
  rating,
}: {
  sourceName: string;
  targetName: string;
  rating: number;
}): boolean {
  if (!sourceName || !targetName) {
    return false;
  }

  if (sourceName === targetName) {
    return true;
  }

  const sourceParts = extractNameParts(sourceName);
  const targetParts = extractNameParts(targetName);

  if (!sourceParts.last || !targetParts.last || sourceParts.last !== targetParts.last) {
    return false;
  }

  if (!sourceParts.first || !targetParts.first) {
    return rating >= 0.6;
  }

  if (sourceParts.first === targetParts.first) {
    return rating >= 0.6;
  }

  if (
    rating >= 0.7 &&
    (sourceParts.first.startsWith(targetParts.first) ||
      targetParts.first.startsWith(sourceParts.first))
  ) {
    return true;
  }

  return false;
}

export function createSleeperIdResolver(
  playerNameMap: { [key: string]: string }
): SleeperIdResolver {
  const normalizedMap = new Map<string, string>();

  for (const [rawName, id] of Object.entries(playerNameMap)) {
    const normalizedName = normalizePlayerName(rawName);
    if (normalizedName && !normalizedMap.has(normalizedName)) {
      normalizedMap.set(normalizedName, id);
    }

    const sanitizedName = sanitizePlayerName(rawName);
    if (sanitizedName && !normalizedMap.has(sanitizedName)) {
      normalizedMap.set(sanitizedName, id);
    }
  }

  const normalizedNames = Array.from(normalizedMap.keys());

  return (playerName: string) => {
    const normalizedName = normalizePlayerName(playerName);
    if (!normalizedName) {
      return null;
    }

    const directMatch = normalizedMap.get(normalizedName);
    if (directMatch) {
      return directMatch;
    }

    const sanitizedName = sanitizePlayerName(playerName);
    if (sanitizedName) {
      const sanitizedMatch = normalizedMap.get(sanitizedName);
      if (sanitizedMatch) {
        return sanitizedMatch;
      }
    }

    if (normalizedNames.length === 0) {
      return null;
    }

    const { bestMatch } = findBestMatch(normalizedName, normalizedNames);
    if (
      bestMatch.rating > 0.5 &&
      isStrongNameMatch({
        sourceName: normalizedName,
        targetName: bestMatch.target,
        rating: bestMatch.rating,
      })
    ) {
      const matchedId = normalizedMap.get(bestMatch.target);
      if (matchedId) {
        return matchedId;
      }
    }

    if (sanitizedName && sanitizedName !== normalizedName) {
      const { bestMatch: sanitizedBestMatch } = findBestMatch(
        sanitizedName,
        normalizedNames
      );
      if (
        sanitizedBestMatch.rating > 0.5 &&
        isStrongNameMatch({
          sourceName: sanitizedName,
          targetName: sanitizedBestMatch.target,
          rating: sanitizedBestMatch.rating,
        })
      ) {
        const matchedId = normalizedMap.get(sanitizedBestMatch.target);
        if (matchedId) {
          return matchedId;
        }
      }
    }

    return null;
  };
}

export function getSleeperHeadshotUrl(sleeperId: string | null) {
  return sleeperId
    ? `${SLEEPER_HEADSHOT_BASE_URL}/${sleeperId}.jpg`
    : SLEEPER_DEFAULT_HEADSHOT_URL;
}
