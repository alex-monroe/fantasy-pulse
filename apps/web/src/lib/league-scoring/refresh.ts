import type { SupabaseClient } from '@supabase/supabase-js';
import {
  inferScoringSettings,
  normalizeFeedName,
  type LeagueScoring,
  type ScoringObservation,
  type SleeperPlayer,
} from '@roster-loom/core';
import { getYahooAccessToken, getYahooLeagueScoring, getYahooPlayerScores } from '@/app/integrations/yahoo/actions';
import { getEspnLeagueScoring, getEspnMatchup } from '@/app/integrations/espn/actions';
import { getOttoneuLeagueScoring } from '@/app/integrations/ottoneu/actions';
import logger from '@/utils/logger';
import { getSleeperWeeklyStats } from './sleeper-stats';
import { saveLeagueScoring, type LeagueScoringKey, type StoredLeagueScoring } from './store';

/** A league whose scoring we can read or infer. */
export type ScoringRefreshTarget = LeagueScoringKey & {
  provider: 'yahoo' | 'espn' | 'ottoneu';
  integrationId?: number;
  /** Yahoo team key / ESPN team id: whose past weeks feed inference. */
  providerTeamId?: string;
};

export type ScoringRefreshContext = {
  supabase: SupabaseClient;
  userId: string;
  /** The NFL season Sleeper's weekly stats are addressed by. */
  statsSeason: string;
  /** The latest NFL week with final results (0 before the season). */
  lastCompletedWeek: number;
  /** Sleeper's player pool, for matching provider players to stat lines. */
  playersData: Record<string, SleeperPlayer>;
};

/** How many completed weeks inference reads back. */
export const INFERENCE_WEEKS = 8;

type ProviderPlayerWeek = { name: string; position: string | null; points: number; week: number };

/** Matches provider players to Sleeper ids by normalized name, then position. */
export function createPoolMatcher(playersData: Record<string, SleeperPlayer>) {
  const byName = new Map<string, string[]>();
  for (const [id, player] of Object.entries(playersData)) {
    const name = player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ');
    if (!name) continue;
    const key = normalizeFeedName(name);
    const list = byName.get(key) ?? [];
    list.push(id);
    byName.set(key, list);
  }
  return (name: string, position: string | null): string | null => {
    let candidates = byName.get(normalizeFeedName(name)) ?? [];
    if (candidates.length > 1 && position) {
      const narrowed = candidates.filter(
        (id) => (playersData[id]?.position ?? '').toUpperCase() === position.toUpperCase()
      );
      if (narrowed.length > 0) candidates = narrowed;
    }
    if (candidates.length > 1) {
      const active = candidates.filter((id) => playersData[id]?.active);
      if (active.length > 0) candidates = active;
    }
    return candidates.length === 1 ? candidates[0] : null;
  };
}

async function yahooPlayerWeeks(
  target: ScoringRefreshTarget,
  context: ScoringRefreshContext,
  weeks: number[]
): Promise<ProviderPlayerWeek[]> {
  if (!target.integrationId || !target.providerTeamId) return [];
  const { access_token } = await getYahooAccessToken(target.integrationId, context.supabase, context.userId);
  if (!access_token) return [];
  const results = await Promise.all(
    weeks.map(async (week) => {
      const { players } = await getYahooPlayerScores(target.integrationId!, target.providerTeamId!, access_token, week);
      return (players ?? []).map((p: any) => ({
        name: String(p.name ?? ''),
        position: p.display_position ?? null,
        points: Number.parseFloat(String(p.totalPoints ?? 'NaN')),
        week,
      }));
    })
  );
  return results.flat();
}

async function espnPlayerWeeks(
  target: ScoringRefreshTarget,
  weeks: number[]
): Promise<ProviderPlayerWeek[]> {
  if (!target.integrationId || !target.providerTeamId) return [];
  const results = await Promise.all(
    weeks.map(async (week) => {
      const { matchup } = await getEspnMatchup(target.integrationId!, target.providerLeagueId, target.providerTeamId!, week);
      if (!matchup) return [];
      return [...(matchup.userTeam.players ?? []), ...(matchup.opponentTeam.players ?? [])].map((p: any) => ({
        name: String(p.name ?? ''),
        position: p.position ?? null,
        points: Number(p.points),
        week,
      }));
    })
  );
  return results.flat();
}

/**
 * Pairs a league's past player-weeks (official points) with Sleeper's
 * weekly stat lines. Players we can't match to exactly one Sleeper id are
 * dropped rather than guessed.
 */
export async function collectObservations(
  target: ScoringRefreshTarget,
  context: ScoringRefreshContext
): Promise<{ observations: ScoringObservation[]; throughWeek: number | null }> {
  const last = context.lastCompletedWeek;
  if (last < 1) return { observations: [], throughWeek: null };
  const weeks = Array.from({ length: Math.min(INFERENCE_WEEKS, last) }, (_, i) => last - i);

  let playerWeeks: ProviderPlayerWeek[] = [];
  if (target.provider === 'yahoo') playerWeeks = await yahooPlayerWeeks(target, context, weeks);
  else if (target.provider === 'espn') playerWeeks = await espnPlayerWeeks(target, weeks);
  // Ottoneu: its settings page is public and only the reception value
  // varies, so a failed read is retried rather than inferred.

  if (playerWeeks.length === 0) return { observations: [], throughWeek: null };

  const match = createPoolMatcher(context.playersData);
  const statsByWeek = new Map<number, Awaited<ReturnType<typeof getSleeperWeeklyStats>>>();
  await Promise.all(
    [...new Set(playerWeeks.map((p) => p.week))].map(async (week) => {
      statsByWeek.set(week, await getSleeperWeeklyStats(context.statsSeason, week));
    })
  );

  const observations: ScoringObservation[] = [];
  for (const playerWeek of playerWeeks) {
    if (!playerWeek.name || !Number.isFinite(playerWeek.points)) continue;
    const sleeperId = match(playerWeek.name, playerWeek.position);
    const stats = sleeperId ? statsByWeek.get(playerWeek.week)?.[sleeperId] : undefined;
    if (!sleeperId || !stats) continue;
    observations.push({
      stats,
      position: context.playersData[sleeperId]?.position ?? playerWeek.position,
      points: playerWeek.points,
      week: playerWeek.week,
    });
  }
  const throughWeek = observations.length > 0 ? Math.max(...observations.map((o) => o.week ?? 0)) : null;
  return { observations, throughWeek };
}

async function readProviderScoring(target: ScoringRefreshTarget, context: ScoringRefreshContext) {
  switch (target.provider) {
    case 'yahoo':
      if (!target.integrationId) return { error: 'No Yahoo integration for this league.' };
      return getYahooLeagueScoring(target.integrationId, target.providerLeagueId, context.supabase, context.userId);
    case 'espn':
      if (!target.integrationId) return { error: 'No ESPN integration for this league.' };
      return getEspnLeagueScoring(target.integrationId, target.providerLeagueId, context.supabase);
    case 'ottoneu':
      return getOttoneuLeagueScoring(target.providerLeagueId);
  }
}

/**
 * Brings one league's scoring up to date and stores it:
 *
 * 1. Read the provider's own settings. When that works, it's the answer.
 * 2. Otherwise infer the settings from completed weeks.
 * 3. With no completed weeks (a league imported pre-season), store 'unknown'.
 *    The scoreboard keeps a stock profile until a later refresh has data.
 *
 * A failed read never throws away settings an earlier read got: the old
 * settings stay, with the error noted.
 *
 * @param previous - What is stored now, if anything.
 * @returns What was stored.
 */
export async function refreshLeagueScoring(
  target: ScoringRefreshTarget,
  context: ScoringRefreshContext,
  previous?: LeagueScoring | null
): Promise<StoredLeagueScoring> {
  const checkedAt = new Date().toISOString();
  let scoring: LeagueScoring;

  const read = await readProviderScoring(target, context).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  if (!('error' in read)) {
    scoring = { source: 'provider', settings: read.settings, unmapped: read.unmapped, inference: null, checkedAt };
  } else if (previous?.source === 'provider' && Object.keys(previous.settings).length > 0) {
    scoring = { ...previous, checkedAt, readError: read.error };
  } else {
    logger.info({ userId: context.userId, ...target, error: read.error }, 'league-scoring: provider read failed, inferring');
    const { observations, throughWeek } = await collectObservations(target, context).catch((error: unknown) => {
      logger.warn({ userId: context.userId, ...target, err: error }, 'league-scoring: collecting observations failed');
      return { observations: [] as ScoringObservation[], throughWeek: null };
    });
    const inferred = observations.length > 0 ? inferScoringSettings(target.provider, observations, { throughWeek }) : null;
    scoring =
      inferred && inferred.sampleSize > 0
        ? {
            source: 'inferred',
            settings: inferred.settings,
            unmapped: [],
            inference: {
              sampleSize: inferred.sampleSize,
              matchRate: inferred.matchRate,
              throughWeek: inferred.throughWeek,
              assumed: inferred.assumed,
            },
            checkedAt,
            readError: read.error,
          }
        : { source: 'unknown', settings: {}, unmapped: [], inference: null, checkedAt, readError: read.error };
  }

  await saveLeagueScoring(context.supabase, context.userId, target, scoring);
  return { ...target, ...scoring };
}
