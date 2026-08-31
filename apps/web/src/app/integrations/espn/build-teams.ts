'use server';

/**
 * Turns a user's ESPN teams into `Team[]`.
 *
 * Like Yahoo and Ottoneu, ESPN players are matched to Sleeper ids by name
 * and scored with the stock projection profile.
 */
import {
  Team,
  Player,
  SleeperProjection,
  SleeperStockScoringMode,
  scoreStockProjection,
} from '@roster-loom/core';
import { DEFAULT_NON_SLEEPER_PROJECTION_SCORING } from '@/lib/nfl/projections';
import {
  createSleeperIdResolver,
  getSleeperHeadshotUrl,
} from '@/lib/nfl/player-matching';
import {
  getEspnLeagueRows,
  getEspnTeamRows,
  getEspnMatchup,
  type EspnRosterPlayer,
} from './actions';

/**
 * Builds teams for an ESPN integration.
 * @param integration The ESPN integration record.
 * @param playerNameMap Sleeper name lookup, used to resolve headshots.
 * @returns A list of teams from ESPN.
 */
export async function buildEspnTeams(
  integration: any,
  playerNameMap: { [key: string]: string },
  sleeperProjectionsByPlayerId?: Map<string, SleeperProjection>,
  projectionScoringMode: SleeperStockScoringMode = DEFAULT_NON_SLEEPER_PROJECTION_SCORING
): Promise<Team[]> {
  const [{ teams: espnTeamRows, error: teamsError }, { leagues: espnLeagueRows }] =
    await Promise.all([
      getEspnTeamRows(integration.id),
      getEspnLeagueRows(integration.id),
    ]);

  if (teamsError || !espnTeamRows?.length) {
    return [];
  }

  const leagueLookup = new Map(
    (espnLeagueRows ?? []).map((league: any) => [league.league_id, league])
  );
  const resolveSleeperId = createSleeperIdResolver(playerNameMap);

  const mapEspnPlayer = (p: EspnRosterPlayer): Player => {
    const sleeperId = resolveSleeperId(p.name);
    const projection = sleeperId
      ? sleeperProjectionsByPlayerId?.get(sleeperId)
      : undefined;
    const projectedPoints = scoreStockProjection(projection, projectionScoringMode);
    return {
      id: p.id || p.name,
      name: p.name,
      position: p.position,
      realTeam: p.realTeam,
      score: p.points,
      gameStatus: 'pregame',
      gameStartTime: null,
      gameQuarter: null,
      gameClock: null,
      onUserTeams: 0,
      onOpponentTeams: 0,
      gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
      imageUrl: getSleeperHeadshotUrl(sleeperId),
      onBench: p.onBench,
      ...(projectedPoints !== null ? { projectedPoints } : {}),
    };
  };

  const builtTeams = await Promise.all(
    espnTeamRows.map(async (row: any): Promise<Team | null> => {
      const { matchup, error } = await getEspnMatchup(
        integration.id,
        row.league_id,
        row.team_id
      );

      if (error || !matchup) {
        return null;
      }

      const leagueRow = leagueLookup.get(row.league_id);

      return {
        id: row.id,
        name: matchup.userTeam.name || row.name,
        league: {
          provider: 'espn',
          providerLeagueId: row.league_id,
          name: leagueRow?.name || `ESPN League ${row.league_id}`,
          season: leagueRow?.season ?? null,
          totalRosters: leagueRow?.total_rosters ?? null,
        },
        totalScore: matchup.userTeam.totalPoints ?? 0,
        players: (matchup.userTeam.players ?? []).map(mapEspnPlayer),
        opponent: {
          name: matchup.opponentTeam.name || 'Opponent',
          totalScore: matchup.opponentTeam.totalPoints ?? 0,
          players: (matchup.opponentTeam.players ?? []).map(mapEspnPlayer),
        },
      };
    })
  );

  return builtTeams.filter((team): team is Team => Boolean(team));
}
