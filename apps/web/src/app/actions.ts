'use server';

import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { logDuration, logEvent, startTimer } from '@/utils/performance-logger';
import { buildSleeperTeams } from '@/app/integrations/sleeper/build-teams';
import { buildYahooTeams } from '@/app/integrations/yahoo/build-teams';
import { buildOttoneuTeams } from '@/app/integrations/ottoneu/build-teams';
import { buildEspnTeams } from '@/app/integrations/espn/build-teams';
import { getNflState, getWeeklyProjections } from '@/app/integrations/sleeper/actions';
import { getYahooUserTeams } from '@/app/integrations/yahoo/actions';
import {
  generateDemoTeams,
  Player,
  Team,
  SleeperProjection,
} from '@roster-loom/core';
import { isDemoModeEnv } from '@/lib/demo-mode';
import { getCurrentNflWeek } from '@/lib/nfl/week';
import { buildTeamGameInfoMap } from '@/lib/nfl/scoreboard';
import {
  getSleeperPlayersResources,
  invalidateSleeperPlayersCache,
} from '@/lib/nfl/sleeper-players';

// Re-exported so existing callers (the MCP route, the Yahoo integration,
// the refresh endpoint) keep their import path while the implementations
// live in @/lib/nfl/*.
export { getCurrentNflWeek, getSleeperPlayersResources, invalidateSleeperPlayersCache };

const teamBuilders = {
  buildSleeperTeams,
  buildYahooTeams,
  buildOttoneuTeams,
  buildEspnTeams,
};

export async function getTeamBuilders() {
  return teamBuilders;
}

/**
 * Gets the user's teams from all integrated platforms.
 * @returns A list of teams.
 */
export async function getTeams(
  client?: SupabaseClient,
  userId?: string,
  options?: { demo?: boolean }
) {
  const overallStart = startTimer();
  logEvent('getTeams invoked');

  // Instance-wide demo mode short-circuits ahead of the login gate. A
  // deployment configured with DEMO_MODE=1 exists only to show fake data, so
  // requiring an account there buys nothing — and skipping it is what makes
  // `DEMO_MODE=1 npm run dev` a genuine zero-credential first run.
  //
  // The per-session opt-ins (the `?demo=1` cookie and the `x-demo-mode`
  // header) deliberately stay *behind* auth further down: on a real
  // deployment nobody should reach a scoreboard by appending a query param.
  if (isDemoModeEnv()) {
    const teams = generateDemoTeams(Date.now());
    logDuration('getTeams total', overallStart, {
      result: 'demo-instance',
      teamCount: teams.length,
    });
    return { teams };
  }

  const supabase = client ?? createClient();

  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const userStart = startTimer();
    const { data: { user } } = await supabase.auth.getUser();
    logDuration('getTeams: fetch user', userStart, { hasUser: Boolean(user) });
    if (!user) {
      logDuration('getTeams total', overallStart, { result: 'no-user' });
      return { error: 'You must be logged in.' };
    }
    resolvedUserId = user.id;
  }

  // Per-session demo opt-in (`?demo=1` cookie, `x-demo-mode` header), which
  // stays behind the login gate above. The instance-wide switch was already
  // handled before auth.
  const demo = options?.demo ?? false;
  if (demo) {
    const teams = generateDemoTeams(Date.now());
    logDuration('getTeams total', overallStart, {
      result: 'demo',
      teamCount: teams.length,
    });
    return { teams };
  }

  const integrationsStart = startTimer();
  const { data: integrations, error: integrationsError } = await supabase
    .from('fp_user_integrations')
    .select('*')
    .eq('user_id', resolvedUserId);
  logDuration('getTeams: load integrations', integrationsStart, {
    integrationCount: integrations?.length ?? 0,
  });

  if (integrationsError) {
    logDuration('getTeams total', overallStart, {
      result: 'integrations-error',
      message: integrationsError.message,
    });
    return { error: integrationsError.message };
  }

  const weekStart = startTimer();
  const week = await getCurrentNflWeek();
  logDuration('getTeams: resolve current NFL week', weekStart, { week });

  const scoreboardPromise = (async () => {
    const scoreboardStart = startTimer();
    try {
      const fetchStart = startTimer();
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`,
        { cache: 'no-store' }
      );
      logDuration('getTeams: fetch NFL scoreboard', fetchStart, {
        status: response.status,
        ok: response.ok,
        week,
      });

      if (!response.ok) {
        throw new Error(`Scoreboard request failed with status ${response.status}`);
      }

      const parseStart = startTimer();
      const data = await response.json();
      logDuration('getTeams: parse NFL scoreboard response', parseStart, {
        eventCount: Array.isArray(data?.events) ? data.events.length : undefined,
        week,
      });
      logDuration('getTeams: NFL scoreboard pipeline', scoreboardStart, {
        success: true,
        week,
      });
      return data;
    } catch (error) {
      logDuration('getTeams: NFL scoreboard pipeline', scoreboardStart, {
        success: false,
        week,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      console.error('Failed to fetch NFL scoreboard', error);
      return null;
    }
  })();

  const sleeperPlayerResources = await getSleeperPlayersResources();
  const { playersData, playerNameMap } = sleeperPlayerResources;

  // Fetched once and shared across every non-Sleeper integration: unlike
  // Sleeper leagues (scored against their own real scoring_settings in
  // buildSleeperTeams), Yahoo/Ottoneu/ESPN players are matched to this by
  // name and scored with a stock Sleeper profile — see
  // DEFAULT_NON_SLEEPER_PROJECTION_SCORING.
  const sleeperProjectionsByPlayerId = new Map<string, SleeperProjection>();
  const projectionsStart = startTimer();
  try {
    const { state: nflState } = await getNflState();
    if (nflState?.season) {
      const { projections } = await getWeeklyProjections(nflState.season, week);
      for (const projection of projections ?? []) {
        sleeperProjectionsByPlayerId.set(projection.player_id, projection);
      }
    }
    logDuration('getTeams: load shared Sleeper projections', projectionsStart, {
      projectionCount: sleeperProjectionsByPlayerId.size,
    });
  } catch (error) {
    logDuration('getTeams: load shared Sleeper projections', projectionsStart, {
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const integrationPromises = integrations.map((integration) => {
    const integrationStart = startTimer();
    const provider = integration?.provider ?? 'unknown';
    const integrationId = integration?.id;

    let builderPromise: Promise<Team[]> | null = null;

    if (integration.provider === 'sleeper') {
      builderPromise = teamBuilders.buildSleeperTeams(
        integration,
        week,
        sleeperPlayerResources
      );
    } else if (integration.provider === 'yahoo') {
      builderPromise = (async () => {
        const {
          teams: yahooTeams,
          error: yahooTeamsError,
          accessToken,
        } = await getYahooUserTeams(integration.id, supabase, integration.user_id);

        if (yahooTeamsError || !yahooTeams) {
          return [] as Team[];
        }

        return teamBuilders.buildYahooTeams(
          integration,
          playerNameMap,
          week,
          accessToken,
          yahooTeams,
          supabase,
          sleeperProjectionsByPlayerId
        );
      })();
    } else if (integration.provider === 'ottoneu') {
      builderPromise = teamBuilders.buildOttoneuTeams(
        integration,
        playerNameMap,
        playersData,
        supabase,
        sleeperProjectionsByPlayerId
      );
    } else if (integration.provider === 'espn') {
      builderPromise = teamBuilders.buildEspnTeams(
        integration,
        playerNameMap,
        sleeperProjectionsByPlayerId
      );
    }

    if (!builderPromise) {
      logDuration('getTeams: skipped integration', integrationStart, {
        provider,
        integrationId,
      });
      return Promise.resolve([] as Team[]);
    }

    return builderPromise
      .then((teams) => {
        logDuration('getTeams: build teams', integrationStart, {
          provider,
          teamCount: teams.length,
          integrationId,
        });
        return teams;
      })
      .catch((error) => {
        logDuration('getTeams: build teams', integrationStart, {
          provider,
          error: error instanceof Error ? error.message : String(error),
          integrationId,
        });
        console.error('Failed to build teams', error);
        return [] as Team[];
      });
  });

  const results = await Promise.all(integrationPromises);

  const flattenStart = startTimer();
  const teams = results.flat();
  logDuration('getTeams: flatten integration results', flattenStart, {
    teamCount: teams.length,
    integrationCount: integrations?.length ?? 0,
  });

  const scoreboardAwaitStart = startTimer();
  const scoreboardData = await scoreboardPromise;
  logDuration('getTeams: await scoreboard data', scoreboardAwaitStart, {
    hasData: Boolean(scoreboardData),
    week,
  });

  const gameInfoBuildStart = startTimer();
  const gameInfoMap = buildTeamGameInfoMap(scoreboardData);
  logDuration('getTeams: build team game info map', gameInfoBuildStart, {
    trackedTeams: gameInfoMap.size,
  });

  const annotatePlayersWithGameInfo = (players: Player[]): Player[] => {
    return players.map((player) => {
      const teamAbbr = (player.realTeam || '').toUpperCase();
      if (!teamAbbr) {
        return {
          ...player,
          gameStartTime: player.gameStartTime ?? null,
          gameQuarter: player.gameQuarter ?? null,
          gameClock: player.gameClock ?? null,
        };
      }

      const gameInfo = gameInfoMap.get(teamAbbr);
      if (!gameInfo) {
        return {
          ...player,
          gameStartTime: player.gameStartTime ?? null,
          gameQuarter: player.gameQuarter ?? null,
          gameClock: player.gameClock ?? null,
        };
      }

      return {
        ...player,
        gameStatus: gameInfo.status,
        gameStartTime: gameInfo.startDate,
        gameQuarter: gameInfo.quarter,
        gameClock: gameInfo.clock,
      };
    });
  };

  const annotateStart = startTimer();
  const teamsWithGameInfo = teams.map((team) => ({
    ...team,
    players: annotatePlayersWithGameInfo(team.players),
    opponent: {
      ...team.opponent,
      players: annotatePlayersWithGameInfo(team.opponent.players),
    },
  }));

  logDuration('getTeams: annotate teams with game info', annotateStart, {
    teamCount: teamsWithGameInfo.length,
    hasScoreboardData: Boolean(scoreboardData),
  });
  logDuration('getTeams total', overallStart, {
    teamCount: teamsWithGameInfo.length,
    integrationCount: integrations?.length ?? 0,
    hasScoreboardData: Boolean(scoreboardData),
  });

  return { teams: teamsWithGameInfo };
}
