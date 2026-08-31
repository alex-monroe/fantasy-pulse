/**
 * The live NFL game clock, from ESPN's public scoreboard endpoint.
 *
 * Every provider's players are annotated with the state of their real
 * game — pregame / in progress / final, quarter and clock — so this is
 * fetched once per request and shared across all four builders rather
 * than per provider.
 */
import { TEAM_ABBREVIATION_ALIASES } from './player-matching';

export type TeamGameInfo = {
  status: 'pregame' | 'in_progress' | 'final';
  startDate: string | null;
  quarter: string | null;
  clock: string | null;
};

export function formatScoreboardPeriod(period: unknown): string | null {
  if (typeof period !== 'number' || period <= 0) {
    return null;
  }

  if (period <= 4) {
    return `Q${period}`;
  }

  const overtimeNumber = period - 4;
  if (overtimeNumber === 1) {
    return 'OT';
  }

  return `${overtimeNumber}OT`;
}

export function buildTeamGameInfoMap(scoreboard: any): Map<string, TeamGameInfo> {
  const map = new Map<string, TeamGameInfo>();

  if (!scoreboard || !Array.isArray(scoreboard.events)) {
    return map;
  }

  for (const event of scoreboard.events) {
    const competition = event?.competitions?.[0];
    if (!competition) {
      continue;
    }

    const competitionStatus = competition?.status?.type;
    const eventStatus = event?.status?.type;
    const state = competitionStatus?.state || eventStatus?.state;

    let status: TeamGameInfo['status'] | null = null;
    if (state === 'pre') {
      status = 'pregame';
    } else if (state === 'in') {
      status = 'in_progress';
    } else if (state === 'post') {
      status = 'final';
    }

    if (!status) {
      continue;
    }

    const startDate =
      typeof competition?.startDate === 'string'
        ? competition.startDate
        : typeof event?.date === 'string'
          ? event.date
          : null;

    const displayClock =
      competition?.status?.displayClock ?? event?.status?.displayClock ?? null;
    const period =
      competition?.status?.period ?? event?.status?.period ?? null;
    const shortDetail =
      competitionStatus?.shortDetail || eventStatus?.shortDetail || null;

    let quarter: string | null = null;
    let clock: string | null = null;

    if (status === 'in_progress') {
      quarter = formatScoreboardPeriod(period);
      clock = typeof displayClock === 'string' ? displayClock : null;
    } else if (status === 'final') {
      if (typeof shortDetail === 'string' && shortDetail.trim()) {
        quarter = shortDetail;
      } else {
        quarter = 'Final';
      }
    }

    const info: TeamGameInfo = {
      status,
      startDate,
      quarter,
      clock,
    };

    const competitors = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];

    for (const competitor of competitors) {
      const abbr = competitor?.team?.abbreviation;
      if (!abbr || typeof abbr !== 'string') {
        continue;
      }

      const normalized = abbr.toUpperCase();
      map.set(normalized, info);

      const aliases = TEAM_ABBREVIATION_ALIASES[normalized];
      if (aliases) {
        for (const alias of aliases) {
          map.set(alias.toUpperCase(), info);
        }
      }
    }
  }

  return map;
}
