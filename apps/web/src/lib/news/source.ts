/**
 * Configuration for the player-news feed the digest is built from.
 *
 * One source today (Rotowire's public NFL news RSS). The shape is a list
 * so a second feed can be added without touching the ingest or the page —
 * items carry their `source` through to the database.
 */

/** Rotowire's public NFL news RSS feed. */
export const ROTOWIRE_SOURCE = 'rotowire';

/** Where the Rotowire feed is read from, overridable for testing. */
export const DEFAULT_ROTOWIRE_FEED_URL =
  'https://www.rotowire.com/rss/news.php?sport=NFL';

/**
 * How long a completed ingest is considered fresh. A page render that
 * finds the pool older than this kicks off an ingest itself, so the
 * digest still works on a deployment with no cron configured.
 */
export const NEWS_FRESHNESS_MS = 15 * 60 * 1000;

/**
 * How far back the digest reads. Player news goes stale fast — a "limited
 * in practice Wednesday" note is noise by the following Tuesday — and the
 * window also bounds the number of rows matched per render.
 */
export const NEWS_WINDOW_DAYS = 7;

/** Hard cap on rows pulled per digest render. */
export const NEWS_ITEM_LIMIT = 500;

/**
 * Resolves the feed URL, honoring the `ROTOWIRE_RSS_URL` override.
 *
 * The override exists so a deployment can point at a mirror or a
 * different Rotowire feed variant without a code change.
 *
 * @returns The URL to fetch the feed from.
 */
export function getRotowireFeedUrl(): string {
  const configured = process.env.ROTOWIRE_RSS_URL?.trim();
  return configured || DEFAULT_ROTOWIRE_FEED_URL;
}
