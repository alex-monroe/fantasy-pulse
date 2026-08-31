'use server';

/**
 * Turns a user's Ottoneu teams into `Team[]`.
 *
 * Ottoneu has no API: rosters are scraped out of the public team pages
 * with JSDOM, then reconciled against the Sleeper master list by name.
 * This is the most fragile of the four builders — see ./README.md.
 */
import { JSDOM } from 'jsdom';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Team,
  Player,
  SleeperPlayer,
  SleeperProjection,
  SleeperStockScoringMode,
  scoreStockProjection,
} from '@roster-loom/core';
import { DEFAULT_NON_SLEEPER_PROJECTION_SCORING } from '@/lib/nfl/projections';
import {
  IGNORED_ROSTER_SPOTS,
  createSleeperIdResolver,
  getSleeperHeadshotUrl,
  normalizeOttoneuTeamName,
  type SleeperIdResolver,
} from '@/lib/nfl/player-matching';
import { getOttoneuLeagueRows, getOttoneuTeamInfo } from './actions';

/**
 * Fetches a team's full roster from its Ottoneu team page. Unlike the
 * matchup/game page, this table exists year-round (preseason, offseason,
 * bye weeks), so it's used whenever there's no active matchup to scrape.
 */
async function fetchOttoneuRosterPlayers(
  teamUrl: string,
  resolveSleeperId: SleeperIdResolver,
  playersData: Record<string, SleeperPlayer>,
  sleeperProjectionsByPlayerId?: Map<string, SleeperProjection>,
  projectionScoringMode: SleeperStockScoringMode = DEFAULT_NON_SLEEPER_PROJECTION_SCORING
): Promise<Player[]> {
  const res = await fetch(teamUrl);
  if (!res.ok) {
    return [];
  }

  const html = await res.text();
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const rosterTable = Array.from(document.querySelectorAll('table')).find(
    (table) => {
      const headerTexts = Array.from(table.querySelectorAll('thead th'))
        .map((th) => th.textContent?.trim().toLowerCase())
        .filter(Boolean) as string[];
      return headerTexts.includes('player') && headerTexts.includes('pos');
    }
  );

  if (!rosterTable) {
    return [];
  }

  const rows = Array.from(rosterTable.querySelectorAll('tbody tr'));

  return rows
    .map((row): Player | null => {
      const playerCell = row.querySelector('td');
      const anchor = playerCell?.querySelector('a[href*="/player_card/"]');
      const name = anchor?.textContent?.trim() || '';
      if (!name) {
        return null;
      }

      const idMatch = (anchor?.getAttribute('href') || '').match(
        /\/player_card\/nfl\/(\d+)/
      );
      const id = idMatch ? idMatch[1] : name;

      const meta =
        playerCell?.querySelector('.smaller')?.textContent?.trim() || '';
      const metaParts = meta.split(' ').filter(Boolean);
      const realTeam = metaParts[0] || '';
      const metaPosition = metaParts.slice(1).join(' ');

      const posCell = row.querySelectorAll('td')[1];
      const posDisplay = posCell?.textContent?.trim() || '';

      const sleeperId = resolveSleeperId(name);
      const sleeperPosition = sleeperId
        ? playersData[sleeperId]?.position
        : undefined;
      const position =
        (sleeperPosition || '').toString().toUpperCase() ||
        (metaPosition ? metaPosition.toUpperCase() : '') ||
        posDisplay.toUpperCase() ||
        '';
      const projection = sleeperId
        ? sleeperProjectionsByPlayerId?.get(sleeperId)
        : undefined;
      const projectedPoints = scoreStockProjection(projection, projectionScoringMode);

      return {
        id,
        name,
        position,
        realTeam,
        score: 0,
        gameStatus: 'pregame',
        gameStartTime: null,
        gameQuarter: null,
        gameClock: null,
        onUserTeams: 0,
        onOpponentTeams: 0,
        gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
        imageUrl: getSleeperHeadshotUrl(sleeperId),
        onBench: false,
        ...(projectedPoints !== null ? { projectedPoints } : {}),
      } satisfies Player;
    })
    .filter((player): player is Player => player !== null);
}

/**
 * Builds teams for an Ottoneu integration.
 * @param integration The Ottoneu integration record.
 * @returns A list of teams from Ottoneu.
 */
export async function buildOttoneuTeams(
  integration: any,
  playerNameMap: { [key: string]: string },
  playersData: Record<string, SleeperPlayer>,
  client?: SupabaseClient,
  sleeperProjectionsByPlayerId?: Map<string, SleeperProjection>,
  projectionScoringMode: SleeperStockScoringMode = DEFAULT_NON_SLEEPER_PROJECTION_SCORING
): Promise<Team[]> {
  const { leagues, error } = await getOttoneuLeagueRows(integration.id, client);
  if (error || !leagues || leagues.length === 0) {
    return [];
  }

  const league = leagues[0];
  const info = await getOttoneuTeamInfo(
    `https://ottoneu.fangraphs.com/football/${league.league_id}/team/${integration.provider_user_id}`
  );

  if ('error' in info) {
    return [];
  }
  const teamId = parseInt(info.teamId, 10);

  let userPlayers: Player[] = [];
  let opponentPlayers: Player[] = [];
  const resolveSleeperId = createSleeperIdResolver(playerNameMap);

  const normalizedTeamName = normalizeOttoneuTeamName(info.teamName);

  if (info.matchup?.url) {
    try {
      const res = await fetch(`https://ottoneu.fangraphs.com${info.matchup.url}`);
      if (res.ok) {
        const html = await res.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const getDetailsName = (details: Element | null) => {
          if (!details) {
            return '';
          }

          const anchorText = details.querySelector('a')?.textContent;
          if (anchorText) {
            return anchorText;
          }

          return details.textContent || '';
        };

        let isHome = false;
        let sideDetermined = false;

        const teamScores = document.querySelector('.team-scores');
        if (teamScores) {
          const homeDetails = teamScores.querySelector('.home-team-details');
          const awayDetails = teamScores.querySelector('.away-team-details');
          const normalizedHome = normalizeOttoneuTeamName(
            getDetailsName(homeDetails)
          );
          const normalizedAway = normalizeOttoneuTeamName(
            getDetailsName(awayDetails)
          );

          if (normalizedHome && normalizedHome === normalizedTeamName) {
            isHome = true;
            sideDetermined = true;
          } else if (normalizedAway && normalizedAway === normalizedTeamName) {
            isHome = false;
            sideDetermined = true;
          }
        }

        if (!sideDetermined) {
          const homeName = normalizeOttoneuTeamName(
            document.querySelector('.game-page-home-team-name')?.textContent || ''
          );
          const awayName = normalizeOttoneuTeamName(
            document.querySelector('.game-page-away-team-name')?.textContent || ''
          );

          if (homeName && homeName === normalizedTeamName) {
            isHome = true;
            sideDetermined = true;
          } else if (awayName && awayName === normalizedTeamName) {
            isHome = false;
            sideDetermined = true;
          }
        }

        const rows = Array.from(
          document.querySelectorAll('.game-details-table tbody tr')
        );

        const parsePlayer = (
          cell: Element,
          pointsCell: Element,
          positionCell: Element
        ): Player => {
          const id = cell.getAttribute('data-player-id') || '';
          const name =
            cell.querySelector('a')?.textContent?.trim() || '';
          const meta =
            cell.querySelector('.smaller')?.textContent?.trim() || '';
          const metaParts = meta.split(' ').filter(Boolean);
          const realTeam = metaParts[0] || '';
          const metaPosition = metaParts.slice(1).join(' ');
          const score = parseFloat(pointsCell.textContent?.trim() || '0') || 0;
          const posDisplay = positionCell.textContent?.trim() || '';
          const rosterSpot = (cell.getAttribute('data-position') || '').trim();
          const onBench =
            posDisplay === 'BN' ||
            rosterSpot.toLowerCase() === 'bench';
          const sleeperId = resolveSleeperId(name);
          const sleeperPosition = sleeperId
            ? playersData[sleeperId]?.position
            : undefined;
          const projection = sleeperId
            ? sleeperProjectionsByPlayerId?.get(sleeperId)
            : undefined;
          const projectedPoints = scoreStockProjection(projection, projectionScoringMode);
          const sanitizedRosterSpot = rosterSpot
            .toUpperCase()
            .replace(/\s+/g, '');
          const sanitizedDisplay = posDisplay.toUpperCase();
          const fallbackRosterSpot = IGNORED_ROSTER_SPOTS.has(
            sanitizedRosterSpot
          )
            ? ''
            : rosterSpot;
          const fallbackDisplaySpot = IGNORED_ROSTER_SPOTS.has(
            sanitizedDisplay
          )
            ? ''
            : posDisplay;
          const position =
            (sleeperPosition || '').toString().toUpperCase() ||
            (metaPosition ? metaPosition.toUpperCase() : '') ||
            fallbackRosterSpot.toUpperCase() ||
            fallbackDisplaySpot.toUpperCase() ||
            '';

          return {
            id,
            name,
            position,
            realTeam,
            score,
            gameStatus: 'pregame',
            gameStartTime: null,
            gameQuarter: null,
            gameClock: null,
            onUserTeams: 0,
            onOpponentTeams: 0,
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
            imageUrl: getSleeperHeadshotUrl(sleeperId),
            onBench: onBench,
            ...(projectedPoints !== null ? { projectedPoints } : {}),
          };
        };

        rows.forEach((row) => {
          const positionCell = row.querySelector('.game-details-position') as Element | null;
          const homeCell = row.querySelector(
            '.home-team-position-player'
          ) as Element | null;
          const homePoints = row.querySelector(
            '.game-page-home-team-text.game-page-points'
          ) as Element | null;
          const awayCell = row.querySelector(
            '.away-team-position-player'
          ) as Element | null;
          const awayPoints = row.querySelector(
            '.game-page-away-team-text.game-page-points'
          ) as Element | null;

          if (homeCell && homePoints && positionCell) {
            const player = parsePlayer(homeCell, homePoints, positionCell);
            if (isHome) {
              userPlayers.push(player);
            } else {
              opponentPlayers.push(player);
            }
          }

          if (awayCell && awayPoints && positionCell) {
            const player = parsePlayer(awayCell, awayPoints, positionCell);
            if (isHome) {
              opponentPlayers.push(player);
            } else {
              userPlayers.push(player);
            }
          }
        });
      }
    } catch (e) {
      console.error('Failed to fetch Ottoneu matchup page', e);
    }
  } else {
    try {
      userPlayers = await fetchOttoneuRosterPlayers(
        `https://ottoneu.fangraphs.com/football/${league.league_id}/team/${integration.provider_user_id}`,
        resolveSleeperId,
        playersData,
        sleeperProjectionsByPlayerId,
        projectionScoringMode
      );
    } catch (e) {
      console.error('Failed to fetch Ottoneu roster page', e);
    }
  }

  return [
    {
      id: Number.isNaN(teamId) ? 0 : teamId,
      name: info.teamName,
      league: {
        provider: 'ottoneu',
        providerLeagueId: String(league.league_id),
        name: league.name || `Ottoneu league ${league.league_id}`,
        season: league.season ?? null,
        totalRosters: league.total_rosters ?? null,
      },
      totalScore: info.matchup?.teamScore ?? 0,
      players: userPlayers,
      opponent: {
        name: info.matchup?.opponentName ?? 'Opponent',
        totalScore: info.matchup?.opponentScore ?? 0,
        players: opponentPlayers,
      },
    },
  ];
}

/**
 * Builds teams for an ESPN integration.
 * @param integration The ESPN integration record.
 * @param playerNameMap Sleeper name lookup, used to resolve headshots.
 * @returns A list of teams from ESPN.
 */
