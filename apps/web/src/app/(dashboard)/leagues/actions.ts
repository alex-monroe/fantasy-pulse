'use server';

import { revalidatePath } from 'next/cache';
import type { LeagueRef, LeagueScoring } from '@roster-loom/core';
import { getTeams } from '@/app/actions';
import { getNflState } from '@/app/integrations/sleeper/actions';
import { scoringKeyFor, usesStoredScoring } from '@/lib/league-scoring/decorate';
import { refreshUserLeagueScoring } from '@/lib/league-scoring/refresh-user';
import { loadLeagueScoring, scoringKeyString } from '@/lib/league-scoring/store';
import { createClient } from '@/utils/supabase/server';

/** One league as the leagues pages show it. */
export type LeagueView = {
  league: LeagueRef;
  teamName: string;
  /** The league's scoring: stored for Yahoo/ESPN/Ottoneu, read live for Sleeper. */
  scoring: LeagueScoring;
};

/**
 * The signed-in user's leagues with their scoring settings, one entry per
 * league (several teams in one league collapse to the first).
 */
export async function getLeagueViews(): Promise<{ leagues: LeagueView[] } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be logged in.' };

  const result = await getTeams(supabase, user.id);
  if ('error' in result) return { error: result.error ?? 'Could not load leagues.' };

  const nflStateResult = await getNflState();
  const nflState = 'state' in nflStateResult ? nflStateResult.state : undefined;
  const defaultSeason = String(nflState?.season ?? new Date().getFullYear());

  const seen = new Set<string>();
  const entries: { league: LeagueRef; teamName: string }[] = [];
  for (const team of result.teams ?? []) {
    if (!team.league) continue;
    const id = `${team.league.provider}:${team.league.providerLeagueId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ league: team.league, teamName: team.name });
  }

  const stored = await loadLeagueScoring(
    supabase,
    user.id,
    entries
      .map((entry) => entry.league)
      .filter(usesStoredScoring)
      .map((league) => scoringKeyFor(league, defaultSeason))
  );

  return {
    leagues: entries.map(({ league, teamName }) => {
      if (league.provider === 'sleeper') {
        return {
          league,
          teamName,
          scoring: {
            source: league.scoringSettings ? 'provider' : 'unknown',
            settings: league.scoringSettings ?? {},
            unmapped: [],
          },
        };
      }
      const row = usesStoredScoring(league)
        ? stored.get(scoringKeyString(scoringKeyFor(league, defaultSeason)))
        : undefined;
      return {
        league,
        teamName,
        scoring: row ?? { source: 'unknown', settings: {}, unmapped: [], checkedAt: null },
      };
    }),
  };
}

/**
 * Reads (or re-infers) one league's scoring now, from the league page's
 * "Check again" button.
 */
export async function recheckLeagueScoring(formData: FormData): Promise<void> {
  const provider = String(formData.get('provider') ?? '');
  const leagueId = String(formData.get('leagueId') ?? '');
  if (!provider || !leagueId) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await refreshUserLeagueScoring(supabase, user.id, {
    force: true,
    only: { provider, providerLeagueId: leagueId },
  });
  revalidatePath('/leagues');
  revalidatePath(`/leagues/${provider}/${encodeURIComponent(leagueId)}`);
}
