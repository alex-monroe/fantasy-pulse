'use server';

/**
 * Turns a user's Sleeper leagues into `Team[]`.
 *
 * Sleeper is the only provider that exposes both stable player ids and the
 * league's real scoring settings, so its players are scored against their
 * own league rather than the stock profile the other three use.
 */
import {
  Team,
  Player,
  SleeperLeague,
  SleeperRoster,
  SleeperMatchup,
  SleeperUser,
  SleeperProjection,
  mapSleeperPlayer,
} from '@roster-loom/core';
import {
  getCurrentSleeperLeagues,
  getLeagueScoringSettings,
  getWeeklyProjections,
} from './actions';
import {
  getSleeperPlayersResources,
  type SleeperPlayersResources,
} from '@/lib/nfl/sleeper-players';

/**
 * Derives a stable numeric team id from a Sleeper league id.
 *
 * Sleeper's leagues endpoint returns only the string `league_id` — there is
 * no numeric `id` on the payload — so `Team.id` was previously `undefined`
 * for every Sleeper team. That collapsed multiple Sleeper leagues into a
 * single entry wherever the dashboard keys teams by id (matchup priority,
 * score-change tracking). Hashing `league_id` keeps ids stable across
 * renders and distinct across leagues.
 */
function sleeperTeamId(leagueId: string): number {
  let hash = 0;
  for (let i = 0; i < leagueId.length; i += 1) {
    hash = (hash * 31 + leagueId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Builds teams for a Sleeper integration.
 * @param integration The sleeper integration record.
 * @param week The current NFL week.
 * @param playerResources Sleeper players data and lookup map.
 * @returns A list of teams from Sleeper.
 */
export async function buildSleeperTeams(
  integration: { id: number; provider_user_id: string },
  week: number,
  playerResources?: SleeperPlayersResources
): Promise<Team[]> {
  const { playersData } =
    playerResources ?? (await getSleeperPlayersResources());

  // Resolve leagues live from Sleeper each build: Sleeper issues a new
  // league_id every season, so the copy saved to fp_leagues at connect time
  // goes stale after a season rollover and would surface last year's rosters.
  const { leagues, error: leaguesError } = await getCurrentSleeperLeagues(
    integration.provider_user_id
  );
  if (leaguesError || !leagues) {
    return [];
  }

  const teams: Team[] = [];

  // Sleeper can list the same league_id more than once (e.g. when the user
  // manages two rosters in it), which would otherwise produce duplicate
  // scoreboards and double-count that league's players in aggregated views.
  const uniqueLeagues = Array.from(
    new Map(
      (leagues as SleeperLeague[]).map((league) => [league.league_id, league])
    ).values()
  );

  for (const league of uniqueLeagues) {
    const [rosters, matchups, leagueUsers, scoringSettingsRes, projectionsRes] =
      await Promise.all([
        fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`).then(
          (response) => response.json() as Promise<SleeperRoster[]>
        ),
        fetch(
          `https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`
        ).then((response) => response.json() as Promise<SleeperMatchup[]>),
        fetch(`https://api.sleeper.app/v1/league/${league.league_id}/users`).then(
          (response) => response.json() as Promise<SleeperUser[]>
        ),
        getLeagueScoringSettings(league.league_id),
        league.season
          ? getWeeklyProjections(league.season, week)
          : Promise.resolve({ projections: [] as SleeperProjection[] }),
      ]);

    if (
      !Array.isArray(rosters) ||
      !Array.isArray(matchups) ||
      !Array.isArray(leagueUsers)
    ) {
      continue;
    }

    // Projections are a nice-to-have layered on top of live scoring, so a
    // failure here (a Sleeper schema change, a transient error) should
    // degrade to "no projected points" rather than dropping the league.
    const scoringSettings = scoringSettingsRes.scoringSettings;
    const projectionsByPlayerId = new Map(
      (projectionsRes.projections ?? []).map((projection) => [
        projection.player_id,
        projection,
      ])
    );

    const userRoster = rosters.find(
      (roster) => roster.owner_id === integration.provider_user_id
    );
    if (!userRoster) continue;

    const userMatchup = matchups.find(
      (matchup) => matchup.roster_id === userRoster.roster_id
    );
    if (!userMatchup) continue;

    const opponentMatchup = matchups.find(
      (matchup) =>
        matchup.matchup_id === userMatchup.matchup_id &&
        matchup.roster_id !== userRoster.roster_id
    );

    const opponentRoster = opponentMatchup
      ? rosters.find((roster) => roster.roster_id === opponentMatchup.roster_id) || null
      : null;

    const userLeagueInfo = leagueUsers.find(
      (user) => user.user_id === integration.provider_user_id
    );
    const userName =
      userLeagueInfo?.metadata?.team_name ||
      userLeagueInfo?.display_name ||
      'My Team';

    const opponentUser = opponentRoster
      ? leagueUsers.find((user) => user.user_id === opponentRoster.owner_id) || null
      : null;
    const opponentName =
      opponentUser?.metadata?.team_name ||
      opponentUser?.display_name ||
      'Opponent';

    const userPlayers = userMatchup.players
      .map((playerId: string) =>
        mapSleeperPlayer({
          playerId,
          playersData,
          matchup: userMatchup,
          roster: userRoster,
          projection: projectionsByPlayerId.get(playerId),
          scoringSettings,
        })
      )
      .filter((player): player is Player => player !== null);

    const opponentPlayers =
      opponentMatchup && opponentMatchup.players
        ? opponentMatchup.players
            .map((playerId: string) =>
              mapSleeperPlayer({
                playerId,
                playersData,
                matchup: opponentMatchup,
                roster: opponentRoster,
                projection: projectionsByPlayerId.get(playerId),
                scoringSettings,
              })
            )
            .filter((player): player is Player => player !== null)
        : [];

    teams.push({
      id: league.id ?? sleeperTeamId(league.league_id),
      name: userName,
      league: {
        provider: 'sleeper',
        providerLeagueId: league.league_id,
        name: league.name || `Sleeper league ${league.league_id}`,
        season: league.season ?? null,
        totalRosters: league.total_rosters ?? null,
      },
      totalScore: userMatchup.points,
      players: userPlayers,
      opponent: {
        name: opponentName,
        totalScore: opponentMatchup ? opponentMatchup.points : 0,
        players: opponentPlayers,
      },
    });
  }

  return teams;
}
