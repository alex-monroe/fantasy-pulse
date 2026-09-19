/**
 * Linking Sleeper player ids to rows of the existing `public.players` table.
 *
 * `players` is the sibling repo's canonical (Ottoneu) player table and has no
 * Sleeper id, so the link is made by name + position. Only current rows are
 * considered (`ottoneu_id > 0`): the table also holds thousands of legacy rows
 * with negative ids, many of them duplicates of the same person.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeNewsName, type SleeperPlayer } from '@roster-loom/core';

/** The positions Ottoneu tracks; anything else (DEF, IDP) has no players row. */
const LINKABLE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

const PAGE_SIZE = 1000;

export type PlayerRow = {
  id: string;
  name: string;
  position: string;
};

export type SleeperPlayerLink = {
  sleeper_id: string;
  player_id: string;
  match_method: 'name_position' | 'name_position_active';
};

/**
 * Pairs each `players` row with at most one Sleeper id. A pair is made only
 * when it is unambiguous, because a wrong link silently joins the wrong
 * person's prices and stats — an absent link is the safer failure.
 *
 * - One Sleeper candidate for the name+position: linked.
 * - Several: linked only if exactly one is still active on a team.
 * - A Sleeper id wanted by more than one row: neither is linked.
 *
 * @param players - Current `players` rows.
 * @param sleeperPlayers - The Sleeper pool, keyed by Sleeper id.
 * @returns The links to store.
 */
export function buildSleeperPlayerLinks(
  players: PlayerRow[],
  sleeperPlayers: Record<string, SleeperPlayer>
): SleeperPlayerLink[] {
  const byNameAndPosition = new Map<string, string[]>();
  for (const [sleeperId, player] of Object.entries(sleeperPlayers)) {
    const position = (player.position ?? '').toUpperCase();
    if (!LINKABLE_POSITIONS.has(position)) {
      continue;
    }
    const names = new Set(
      [player.full_name, [player.first_name, player.last_name].filter(Boolean).join(' ')]
        .map((name) => normalizeNewsName(name ?? ''))
        .filter(Boolean)
    );
    for (const name of names) {
      const key = `${name}|${position}`;
      const candidates = byNameAndPosition.get(key);
      if (!candidates) {
        byNameAndPosition.set(key, [sleeperId]);
      } else if (!candidates.includes(sleeperId)) {
        candidates.push(sleeperId);
      }
    }
  }

  const claims = new Map<string, SleeperPlayerLink[]>();
  for (const row of players) {
    const key = `${normalizeNewsName(row.name)}|${(row.position ?? '').toUpperCase()}`;
    const candidates = byNameAndPosition.get(key);
    if (!candidates) {
      continue;
    }

    let sleeperId: string | undefined;
    let match_method: SleeperPlayerLink['match_method'] = 'name_position';
    if (candidates.length === 1) {
      sleeperId = candidates[0];
    } else {
      const active = candidates.filter((id) => {
        const candidate = sleeperPlayers[id];
        return candidate.active !== false && Boolean(candidate.team);
      });
      if (active.length === 1) {
        sleeperId = active[0];
        match_method = 'name_position_active';
      }
    }

    if (sleeperId) {
      const existing = claims.get(sleeperId) ?? [];
      existing.push({ sleeper_id: sleeperId, player_id: row.id, match_method });
      claims.set(sleeperId, existing);
    }
  }

  return [...claims.values()].filter((group) => group.length === 1).map((group) => group[0]);
}

/**
 * Reads the current, non-college `players` rows a Sleeper id can be linked to.
 * PostgREST caps a response at 1000 rows, so this pages.
 */
export async function loadLinkablePlayers(client: SupabaseClient): Promise<PlayerRow[]> {
  const rows: PlayerRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('players')
      .select('id, name, position')
      .gt('ottoneu_id', 0)
      .eq('is_college', false)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Could not read players: ${error.message}`);
    }
    rows.push(...((data ?? []) as PlayerRow[]));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
}

/**
 * Rebuilds `fp_sleeper_player_links`: upserts this run's links, then prunes
 * any left over from an earlier run (a player who left the pool, or was
 * re-matched). Upsert-then-prune keeps the table populated throughout.
 * @returns How many links are now stored.
 */
export async function syncSleeperPlayerLinks(
  client: SupabaseClient,
  sleeperPlayers: Record<string, SleeperPlayer>
): Promise<number> {
  const runStartedAt = new Date().toISOString();
  const links = buildSleeperPlayerLinks(await loadLinkablePlayers(client), sleeperPlayers);

  if (links.length > 0) {
    const { error } = await client
      .from('fp_sleeper_player_links')
      .upsert(links.map((link) => ({ ...link, linked_at: runStartedAt })), {
        onConflict: 'sleeper_id',
      });
    if (error) {
      throw new Error(`Could not store player links: ${error.message}`);
    }
  }

  const { error: pruneError } = await client
    .from('fp_sleeper_player_links')
    .delete()
    .lt('linked_at', runStartedAt);
  if (pruneError) {
    throw new Error(`Could not prune stale player links: ${pruneError.message}`);
  }

  return links.length;
}
