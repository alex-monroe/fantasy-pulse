import { SleeperStockScoringMode } from '@roster-loom/core';

/**
 * Scoring profile used to turn a Sleeper projection into a point total for
 * Yahoo/Ottoneu/ESPN players, whose leagues' real scoring settings this app
 * can't read. Sleeper leagues score against their own actual settings
 * instead (see `buildSleeperTeams`). Swap this (or thread a per-league
 * override through the builders) once per-league scoring selection exists.
 */
export const DEFAULT_NON_SLEEPER_PROJECTION_SCORING: SleeperStockScoringMode =
  'half_ppr';
