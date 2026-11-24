import type { SupabaseClient } from '@supabase/supabase-js';
import type { FantasyProvider, LeagueScoring, LeagueScoringStatus, ScoringSource } from '@roster-loom/core';
import { isScoringTrusted } from '@roster-loom/core';
import logger from '@/utils/logger';

/** Identifies one league-season's scoring row. */
export type LeagueScoringKey = {
  provider: FantasyProvider;
  providerLeagueId: string;
  season: string;
};

/** A stored scoring row, as read back. */
export type StoredLeagueScoring = LeagueScoringKey & LeagueScoring;

/** Provider reads are re-checked daily: commissioners can change rules. */
export const PROVIDER_RECHECK_MS = 24 * 60 * 60 * 1000;
/** Unknown or inferred settings are retried more often, as weeks complete. */
export const FALLBACK_RECHECK_MS = 6 * 60 * 60 * 1000;

/**
 * The latest NFL week with final results, from Sleeper's NFL state.
 * Pre-season: 0. Regular season: the week before the current one.
 */
export function lastCompletedWeekFor(state: { week?: number; season_type?: string } | undefined): number {
  if (!state) return 0;
  if (state.season_type === 'pre') return 0;
  if (state.season_type === 'post') return 18;
  const week = Number(state.week);
  return Number.isFinite(week) ? Math.max(0, week - 1) : 0;
}

export const scoringKeyString = (key: LeagueScoringKey) => `${key.provider}:${key.providerLeagueId}:${key.season}`;

function rowToScoring(row: any): StoredLeagueScoring {
  return {
    provider: row.provider,
    providerLeagueId: row.provider_league_id,
    season: row.season,
    source: (row.source ?? 'unknown') as ScoringSource,
    settings: (row.settings ?? {}) as Record<string, number>,
    unmapped: Array.isArray(row.unmapped) ? row.unmapped : [],
    inference: row.inference ?? null,
    checkedAt: row.checked_at ?? null,
    readError: row.read_error ?? null,
  };
}

/**
 * Whether a league's scoring should be read or inferred again.
 *
 * @param scoring - The stored scoring, if any.
 * @param lastCompletedWeek - The latest NFL week with final results (0 pre-season).
 * @param now - The current time in ms.
 */
export function isScoringStale(
  scoring: LeagueScoring | null | undefined,
  lastCompletedWeek: number,
  now: number = Date.now()
): boolean {
  if (!scoring?.checkedAt) return true;
  const age = now - Date.parse(scoring.checkedAt);
  if (!Number.isFinite(age)) return true;
  if (scoring.source === 'provider') return age > PROVIDER_RECHECK_MS;
  // A week finished since the last fit: there is new evidence.
  if (lastCompletedWeek > (scoring.inference?.throughWeek ?? 0)) {
    return age > 15 * 60 * 1000;
  }
  return age > FALLBACK_RECHECK_MS;
}

/** The status summary attached to a team's league. */
export function scoringStatus(
  scoring: LeagueScoring | null | undefined,
  lastCompletedWeek: number,
  now: number = Date.now()
): LeagueScoringStatus {
  return {
    source: scoring?.source ?? 'unknown',
    trusted: isScoringTrusted(scoring),
    stale: isScoringStale(scoring, lastCompletedWeek, now),
    checkedAt: scoring?.checkedAt ?? null,
    ...(scoring?.inference
      ? { matchRate: scoring.inference.matchRate, sampleSize: scoring.inference.sampleSize }
      : {}),
  };
}

/**
 * Loads the user's stored scoring for a set of leagues, in one query.
 *
 * @returns Rows keyed by {@link scoringKeyString}. Empty on any error: a
 *   missing table (migration not applied) must never break the scoreboard.
 */
export async function loadLeagueScoring(
  supabase: SupabaseClient,
  userId: string,
  keys: LeagueScoringKey[]
): Promise<Map<string, StoredLeagueScoring>> {
  const result = new Map<string, StoredLeagueScoring>();
  const leagueIds = [...new Set(keys.map((key) => key.providerLeagueId))];
  if (leagueIds.length === 0) return result;
  try {
    const { data, error } = await supabase
      .from('fp_league_scoring')
      .select('*')
      .eq('user_id', userId)
      .in('provider_league_id', leagueIds);
    if (error || !data) {
      if (error) logger.warn({ userId, err: error }, 'league-scoring: load failed');
      return result;
    }
    for (const row of data) {
      const scoring = rowToScoring(row);
      result.set(scoringKeyString(scoring), scoring);
    }
  } catch (error) {
    logger.warn({ userId, err: error }, 'league-scoring: load threw');
  }
  return result;
}

/** Loads one league's stored scoring, or null. */
export async function loadOneLeagueScoring(
  supabase: SupabaseClient,
  userId: string,
  key: LeagueScoringKey
): Promise<StoredLeagueScoring | null> {
  const rows = await loadLeagueScoring(supabase, userId, [key]);
  return rows.get(scoringKeyString(key)) ?? null;
}

/** Writes a league's scoring, replacing any earlier row for the same league-season. */
export async function saveLeagueScoring(
  supabase: SupabaseClient,
  userId: string,
  key: LeagueScoringKey,
  scoring: LeagueScoring
): Promise<{ error?: string }> {
  const { error } = await supabase.from('fp_league_scoring').upsert(
    {
      user_id: userId,
      provider: key.provider,
      provider_league_id: key.providerLeagueId,
      season: key.season,
      source: scoring.source,
      settings: scoring.settings,
      unmapped: scoring.unmapped,
      inference: scoring.inference ?? null,
      read_error: scoring.readError ?? null,
      checked_at: scoring.checkedAt ?? new Date().toISOString(),
    },
    { onConflict: 'user_id,provider,provider_league_id,season' }
  );
  if (error) {
    logger.error({ userId, ...key, err: error }, 'league-scoring: save failed');
    return { error: error.message };
  }
  return {};
}
