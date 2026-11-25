import type { SupabaseClient } from '@supabase/supabase-js';
import type { Team } from '@roster-loom/core';
import { getSleeperPlayersResources, getTeams } from '@/app/actions';
import { getNflState } from '@/app/integrations/sleeper/actions';
import { invalidateTeamsSnapshots } from '@/lib/teams-cache';
import logger from '@/utils/logger';
import { scoringKeyFor, usesStoredScoring } from './decorate';
import { refreshLeagueScoring, type ScoringRefreshTarget } from './refresh';
import {
  isScoringStale,
  lastCompletedWeekFor,
  loadLeagueScoring,
  scoringKeyString,
  type StoredLeagueScoring,
} from './store';

/** At most this many leagues are refreshed per call, to bound the request. */
const MAX_REFRESHES_PER_CALL = 6;

export type RefreshUserScoringOptions = {
  /** Refresh even if the stored settings are fresh. */
  force?: boolean;
  /** Only this league. */
  only?: { provider: string; providerLeagueId: string };
  /** Teams already in hand (skips the getTeams snapshot read). */
  teams?: Team[];
};

/**
 * Reads or infers scoring for the user's Yahoo/ESPN/Ottoneu leagues whose
 * stored settings are missing or stale, then drops the teams snapshot so
 * the next scoreboard render picks the new settings up.
 *
 * @returns What was refreshed, plus every league's stored scoring after the run.
 */
export async function refreshUserLeagueScoring(
  supabase: SupabaseClient,
  userId: string,
  options: RefreshUserScoringOptions = {}
): Promise<{ refreshed: StoredLeagueScoring[]; error?: string }> {
  let teams = options.teams;
  if (!teams) {
    const result = await getTeams(supabase, userId);
    if ('error' in result) return { refreshed: [], error: result.error };
    teams = result.teams ?? [];
  }

  const [nflStateResult, resources] = await Promise.all([getNflState(), getSleeperPlayersResources()]);
  const nflState = 'state' in nflStateResult ? nflStateResult.state : undefined;
  const defaultSeason = String(nflState?.season ?? new Date().getFullYear());
  const lastCompletedWeek = lastCompletedWeekFor(nflState);

  // One target per league, even when the user has several teams in it.
  const targets = new Map<string, ScoringRefreshTarget>();
  for (const team of teams) {
    const league = team.league;
    if (!usesStoredScoring(league)) continue;
    if (
      options.only &&
      (options.only.provider !== league.provider || options.only.providerLeagueId !== league.providerLeagueId)
    ) {
      continue;
    }
    const key = scoringKeyFor(league, defaultSeason);
    const id = scoringKeyString(key);
    if (!targets.has(id)) {
      targets.set(id, {
        ...key,
        provider: league.provider,
        integrationId: league.integrationId,
        providerTeamId: league.providerTeamId,
      });
    }
  }

  const stored = await loadLeagueScoring(supabase, userId, [...targets.values()]);
  const due = [...targets.entries()]
    .filter(([id]) => options.force || isScoringStale(stored.get(id), lastCompletedWeek))
    .slice(0, MAX_REFRESHES_PER_CALL);

  const refreshed: StoredLeagueScoring[] = [];
  for (const [id, target] of due) {
    try {
      refreshed.push(
        await refreshLeagueScoring(
          target,
          { supabase, userId, statsSeason: defaultSeason, lastCompletedWeek, playersData: resources.playersData },
          stored.get(id)
        )
      );
    } catch (error) {
      logger.error({ userId, ...target, err: error }, 'league-scoring: refresh failed');
    }
  }

  if (refreshed.length > 0) invalidateTeamsSnapshots();
  return { refreshed };
}
