import {
  SCORING_RESOLVED_PROVIDERS,
  isScoringTrusted,
  scoreStatLine,
  type LeagueRef,
  type Player,
  type SleeperProjection,
  type Team,
} from '@roster-loom/core';
import { scoringKeyString, scoringStatus, type LeagueScoringKey, type StoredLeagueScoring } from './store';

/** Whether a league's scoring lives in `fp_league_scoring` (not Sleeper, not demo). */
export function usesStoredScoring(league: LeagueRef | undefined): league is LeagueRef & {
  provider: 'yahoo' | 'espn' | 'ottoneu';
} {
  return Boolean(league && SCORING_RESOLVED_PROVIDERS.includes(league.provider) && league.providerLeagueId);
}

/** The stored-scoring key for a team's league. */
export function scoringKeyFor(league: LeagueRef, defaultSeason: string): LeagueScoringKey {
  return {
    provider: league.provider,
    providerLeagueId: league.providerLeagueId,
    season: league.season ? String(league.season) : defaultSeason,
  };
}

function rescore(players: Player[], settings: Record<string, number>, projections?: Map<string, SleeperProjection>) {
  if (!projections) return players;
  return players.map((player) => {
    const projection = player.sleeperId ? projections.get(player.sleeperId) : undefined;
    const projectedPoints = scoreStatLine(projection?.stats, settings);
    if (projectedPoints === null || projectedPoints === undefined) return player;
    return { ...player, projectedPoints };
  });
}

/**
 * Attaches each league's scoring to the teams the providers built (pure):
 *
 * - Every league gets a `scoring` status (for the badge and to decide on a refresh).
 * - Where the stored settings are trusted (a provider read, or a confident
 *   inference), they become the league's `scoringSettings`. Live plays are
 *   then scored exactly, and Sleeper projections are re-scored with them in
 *   place of the stock half-PPR profile.
 * - Sleeper leagues already carry their settings; they are marked as read
 *   from the provider.
 *
 * @param teams - Teams as built.
 * @param stored - Stored scoring rows, keyed by `scoringKeyString`.
 * @param options.defaultSeason - The season for leagues that don't name one.
 * @param options.lastCompletedWeek - For the staleness check.
 * @param options.projections - Sleeper projections by Sleeper id, for re-scoring.
 */
export function applyLeagueScoring(
  teams: Team[],
  stored: Map<string, StoredLeagueScoring>,
  options: {
    defaultSeason: string;
    lastCompletedWeek: number;
    projections?: Map<string, SleeperProjection>;
    now?: number;
  }
): Team[] {
  return teams.map((team) => {
    const league = team.league;
    if (!league) return team;
    if (league.provider === 'sleeper') {
      return {
        ...team,
        league: {
          ...league,
          scoring: { source: 'provider', trusted: Boolean(league.scoringSettings), stale: false, checkedAt: null },
        },
      };
    }
    if (!usesStoredScoring(league)) return team;

    const scoring = stored.get(scoringKeyString(scoringKeyFor(league, options.defaultSeason))) ?? null;
    const status = scoringStatus(scoring, options.lastCompletedWeek, options.now);
    if (!scoring || !isScoringTrusted(scoring)) {
      return { ...team, league: { ...league, scoring: status } };
    }

    return {
      ...team,
      league: { ...league, scoring: status, scoringSettings: scoring.settings },
      players: rescore(team.players ?? [], scoring.settings, options.projections),
      opponent: {
        ...team.opponent,
        players: rescore(team.opponent?.players ?? [], scoring.settings, options.projections),
      },
    };
  });
}
