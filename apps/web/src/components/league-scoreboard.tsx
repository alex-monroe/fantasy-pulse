'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatWinProbability,
  getMatchupColor,
  getTeamKey,
  summarizeMatchup,
  summarizeWeek,
  type MatchupSummary,
  type Team,
} from '@roster-loom/core';

/**
 * One league's matchup, reduced to a tile: who you are, who you're
 * playing, both sides' scores now and where both are projected to
 * finish, and a tug-of-war bar showing the split. The differential is
 * the number you actually read on a Sunday, so it gets the color; the
 * win probability underneath is what the projected gap is worth with
 * however much football is left.
 */
function MatchupTile({
  summary,
  color,
  isMyScoreChanged,
  isOpponentScoreChanged,
}: {
  summary: MatchupSummary;
  color: string;
  isMyScoreChanged: boolean;
  isOpponentScoreChanged: boolean;
}) {
  const { team, score, opponentScore, differential, isLeading, isTied, scoreShare, counts, projection } =
    summary;
  const differentialLabel = `${differential > 0 ? '+' : differential < 0 ? '−' : '±'}${Math.abs(differential).toFixed(1)}`;
  const remaining = counts.live + counts.yetToPlay;
  const showProjection = projection.hasProjections;
  const winPercent = Math.round(projection.winProbability * 100);
  const isProjectedToWin = projection.differential > 0;
  // A dead-even projection is neither good news nor bad; don't color it as either.
  const isProjectedTied = Math.abs(projection.differential) < 0.05;

  return (
    <div
      data-testid="matchup-tile"
      className="min-w-[220px] flex-shrink-0 rounded-lg border bg-card p-2.5 md:min-w-0"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {team.league?.name ?? team.name}
        </p>
        <span
          className={cn(
            'ml-auto flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
            isTied
              ? 'bg-muted text-muted-foreground'
              : isLeading
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400'
          )}
        >
          {differentialLabel}
        </span>
      </div>

      <div className="mt-1.5 space-y-0.5">
        {showProjection && (
          <div
            aria-hidden="true"
            className="flex items-baseline gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70"
          >
            <span className="min-w-0 flex-1" />
            <span className="min-w-[2.5rem] text-right">Proj</span>
            <span className="min-w-[3.25rem] text-right">Now</span>
          </div>
        )}
        <div className="flex items-baseline gap-1.5">
          <p className={cn('min-w-0 flex-1 truncate text-sm', isLeading ? 'font-semibold' : 'font-medium')}>
            {team.name}
          </p>
          {showProjection && (
            <p
              data-testid="matchup-team-projection"
              className="min-w-[2.5rem] text-right text-xs font-medium leading-none tabular-nums text-muted-foreground"
            >
              {projection.team.projected.toFixed(1)}
            </p>
          )}
          <p
            data-testid="matchup-team-score"
            className={cn(
              'min-w-[3.25rem] text-right text-lg font-bold leading-none tabular-nums',
              isLeading ? 'text-primary' : 'text-foreground'
            )}
          >
            <span className={cn('inline-block', isMyScoreChanged && 'score-celebrate')}>{score.toFixed(1)}</span>
          </p>
        </div>
        <div className="flex items-baseline gap-1.5 text-muted-foreground">
          <p className="min-w-0 flex-1 truncate text-xs">{team.opponent?.name ?? 'Opponent'}</p>
          {showProjection && (
            <p
              data-testid="matchup-opponent-projection"
              className="min-w-[2.5rem] text-right text-xs font-medium leading-none tabular-nums"
            >
              {projection.opponent.projected.toFixed(1)}
            </p>
          )}
          <p
            data-testid="matchup-opponent-score"
            className="min-w-[3.25rem] text-right text-sm font-semibold leading-none tabular-nums"
          >
            <span className={cn('inline-block', isOpponentScoreChanged && 'score-celebrate')}>
              {opponentScore.toFixed(1)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn('h-full rounded-full', isLeading ? 'bg-primary' : 'bg-muted-foreground/50')}
          style={{ width: `${Math.round(scoreShare * 100)}%` }}
        />
      </div>

      {showProjection && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Win prob
            </span>
            <span
              data-testid="matchup-win-probability"
              className={cn(
                'text-[11px] font-bold leading-none tabular-nums',
                isProjectedTied
                  ? 'text-muted-foreground'
                  : isProjectedToWin
                    ? 'text-emerald-400'
                    : 'text-red-400'
              )}
            >
              {formatWinProbability(projection.winProbability, projection.settled)}
            </span>
          </div>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={cn(
                'h-full rounded-full',
                isProjectedTied
                  ? 'bg-muted-foreground/50'
                  : isProjectedToWin
                    ? 'bg-emerald-500'
                    : 'bg-red-500/70'
              )}
              style={{ width: `${Math.min(100, Math.max(0, winPercent))}%` }}
            />
          </div>
        </div>
      )}

      <p className="mt-1.5 text-[10px] leading-none text-muted-foreground">
        {counts.live > 0 && <span className="font-medium text-emerald-400">{counts.live} live</span>}
        {counts.live > 0 && remaining > counts.live && ' · '}
        {counts.yetToPlay > 0 && `${counts.yetToPlay} to play`}
        {remaining === 0 && 'All games final'}
        {projection.unprojectedStarters > 0 && (
          <span className="text-muted-foreground/70">
            {` · ${projection.unprojectedStarters} unprojected`}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * The sticky rail under the nav: every league you're playing this week,
 * side by side, so a glance answers "am I winning?" across all of them
 * without scrolling. Collapses to a single summary line when the board
 * below needs the room.
 *
 * @param teams - The user's teams, in display order.
 * @param teamColors - Team key -> matchup color, shared with the player dots.
 * @param changedScoreKeys - Score keys that moved on the last refresh.
 * @param collapsed - Whether the tiles are hidden.
 * @param onToggleCollapsed - Called when the collapse control is used.
 * @returns The scoreboard rail.
 */
export function LeagueScoreboard({
  teams,
  teamColors,
  changedScoreKeys,
  collapsed,
  onToggleCollapsed,
}: {
  teams: Team[];
  teamColors: Map<string, string>;
  changedScoreKeys: Set<string>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const summaries = useMemo(() => teams.map((team) => summarizeMatchup(team)), [teams]);
  const week = useMemo(() => summarizeWeek(teams), [teams]);

  if (teams.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="League matchups"
      className="sticky top-14 z-40 border-b bg-background/95 backdrop-blur"
    >
      <div className="px-2 py-2 sm:px-4 lg:px-6">
        <div className="flex items-center gap-2 pb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Week scoreboard
          </h2>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
            <span className="text-primary">{week.leading}</span>
            <span className="text-muted-foreground">–</span>
            <span className="text-red-400">{week.trailing}</span>
            {week.tied > 0 && <span className="text-muted-foreground">–{week.tied}</span>}
          </span>
          {week.projectedMatchups > 0 && (
            <span
              data-testid="week-projected-record"
              className="hidden rounded bg-muted/50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground sm:inline"
            >
              {`Proj ${week.projectedLeading}–${week.projectedTrailing}`}
              {week.projectedTied > 0 && `–${week.projectedTied}`}
              <span className="font-normal">{` · ${week.expectedWins.toFixed(1)} exp wins`}</span>
            </span>
          )}
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
            {week.playersLive > 0 && (
              <span className="font-medium text-emerald-400">
                {`${week.playersLive} ${week.playersLive === 1 ? 'player' : 'players'} live`}
              </span>
            )}
            {week.playersLive > 0 && week.playersYetToPlay > 0 && ' · '}
            {week.playersYetToPlay > 0 && `${week.playersYetToPlay} yet to play`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
          >
            {collapsed ? 'Show' : 'Hide'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', collapsed && '-rotate-90')} />
          </Button>
        </div>

        {!collapsed && (
          <div className="flex max-h-[38vh] gap-2 overflow-x-auto overflow-y-auto pb-1 md:grid md:grid-cols-3 md:overflow-x-visible lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {summaries.map((summary, index) => {
              const teamKey = getTeamKey(summary.team, index);
              return (
                <MatchupTile
                  key={teamKey}
                  summary={summary}
                  color={teamColors.get(teamKey) ?? getMatchupColor(index)}
                  isMyScoreChanged={changedScoreKeys.has(`${teamKey}-total`)}
                  isOpponentScoreChanged={changedScoreKeys.has(`${teamKey}-opponent`)}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
