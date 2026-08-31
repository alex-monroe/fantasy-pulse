/**
 * The Sleeper master player list, cached process-wide.
 *
 * Sleeper's /v1/players/nfl response is several megabytes and every
 * provider needs it — Sleeper for player details, the other three to
 * resolve names to Sleeper ids. Fetching it per provider per request
 * dominated the home-page render, so it is loaded once and cached.
 */
import { SleeperPlayer } from '@roster-loom/core';
import { logDuration, startTimer } from '@/utils/performance-logger';
import { normalizePlayerName, sanitizePlayerName } from './player-matching';

const SLEEPER_PLAYERS_CACHE_TTL_MS = 5 * 60 * 1000;

export type SleeperPlayersResources = {
  playersData: Record<string, SleeperPlayer>;
  playerNameMap: { [key: string]: string };
};

let sleeperPlayersCachePromise: Promise<SleeperPlayersResources> | null = null;
let sleeperPlayersCacheExpiresAt = 0;

async function loadSleeperPlayersResources(): Promise<SleeperPlayersResources> {
  const playersFetchStart = startTimer();
  const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
  logDuration('getTeams: fetch Sleeper players', playersFetchStart, {
    status: playersResponse.status,
    ok: playersResponse.ok,
  });

  const playersParseStart = startTimer();
  const playersJson = await playersResponse.json();
  logDuration('getTeams: parse Sleeper players response', playersParseStart);

  const playersData =
    playersJson && typeof playersJson === 'object'
      ? (playersJson as Record<string, SleeperPlayer>)
      : ({} as Record<string, SleeperPlayer>);

  const playerNameMap: { [key: string]: string } = {};
  const playerMapBuildStart = startTimer();
  const playerIds = Object.keys(playersData);
  const totalPlayers = playerIds.length;

  const addPlayerName = (name: string | null | undefined, playerId: string) => {
    if (!name) {
      return;
    }

    const normalizedName = normalizePlayerName(name);
    if (!normalizedName) {
      return;
    }

    playerNameMap[normalizedName] = playerId;

    const sanitizedName = sanitizePlayerName(name);
    if (sanitizedName && sanitizedName !== normalizedName) {
      playerNameMap[sanitizedName] = playerId;
    }
  };

  for (const playerId of playerIds) {
    const player = playersData[playerId];
    if (!player) {
      continue;
    }

    addPlayerName(player.full_name ?? null, playerId);

    const combinedName = [player.first_name, player.last_name]
      .filter((part) => part && part.trim())
      .join(' ');
    addPlayerName(combinedName || null, playerId);
  }

  logDuration('getTeams: build Sleeper player name map', playerMapBuildStart, {
    totalPlayers,
    uniqueNames: Object.keys(playerNameMap).length,
  });

  return { playersData, playerNameMap };
}

export async function getSleeperPlayersResources({
  forceRefresh = false,
}: { forceRefresh?: boolean } = {}): Promise<SleeperPlayersResources> {
  const now = Date.now();

  if (!forceRefresh && sleeperPlayersCachePromise && now < sleeperPlayersCacheExpiresAt) {
    return sleeperPlayersCachePromise;
  }

  const loadPromise = loadSleeperPlayersResources()
    .then((result) => {
      sleeperPlayersCacheExpiresAt = Date.now() + SLEEPER_PLAYERS_CACHE_TTL_MS;
      return result;
    })
    .catch((error) => {
      if (sleeperPlayersCachePromise === loadPromise) {
        sleeperPlayersCachePromise = null;
        sleeperPlayersCacheExpiresAt = 0;
      }
      throw error;
    });

  sleeperPlayersCachePromise = loadPromise;
  sleeperPlayersCacheExpiresAt = Number.POSITIVE_INFINITY;

  return sleeperPlayersCachePromise;
}

export async function invalidateSleeperPlayersCache() {
  sleeperPlayersCachePromise = null;
  sleeperPlayersCacheExpiresAt = 0;
}
