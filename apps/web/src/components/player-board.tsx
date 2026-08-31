'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PlayerCard } from '@/components/player-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PLAYER_POSITIONS, groupPlayersByPosition, type GroupedPlayer } from '@roster-loom/core';

/**
 * How wide the board is allowed to get. `wide` is the full-bleed board
 * you get when opponents are hidden; `split` is one half of the
 * side-by-side comparison. Tailwind needs literal class names, so the two
 * column ramps are spelled out rather than composed.
 */
export type BoardWidth = 'wide' | 'split';

const COLUMN_CLASSES: Record<BoardWidth, string> = {
  wide: 'grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
  split: 'grid gap-2 sm:grid-cols-2 2xl:grid-cols-3',
};

const sumScores = (players: GroupedPlayer[]) =>
  players.reduce((total, player) => total + (player.score ?? 0), 0);

const byScoreDescending = (a: GroupedPlayer, b: GroupedPlayer) => b.score - a.score;

/**
 * One horizontal band of the board — a position group whose players flow
 * across the full width instead of stacking one per row. This is what
 * turns a 60-row scroll into three or four glanceable rows on a desktop
 * screen.
 */
function PositionBand({
  label,
  players,
  width,
  isPlayerScoreChanged,
  keyPrefix,
}: {
  label: string;
  players: GroupedPlayer[];
  width: BoardWidth;
  isPlayerScoreChanged: (player: GroupedPlayer) => boolean;
  keyPrefix: string;
}) {
  if (players.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2 border-b border-border/60 pb-1">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">{players.length}</span>
        <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">
          {sumScores(players).toFixed(1)}
        </span>
      </div>
      <div className={COLUMN_CLASSES[width]}>
        {players.map((player) => (
          <PlayerCard
            key={`${keyPrefix}-${player.id}-${player.name}`}
            player={player}
            isScoreChanged={isPlayerScoreChanged(player)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * A full roster board: every player you (or your opponents) have across
 * every league, deduplicated, grouped into position bands that flow
 * across the available width, with the bench tucked behind a toggle.
 *
 * @param title - The board heading.
 * @param players - The grouped players to show, starters and bench alike.
 * @param width - Whether the board owns the full width or half of it.
 * @param keyPrefix - Prefix for React keys, so two boards can coexist.
 * @param isPlayerScoreChanged - Whether a player's score just moved.
 * @param tone - `opponent` mutes the board so your own players lead the eye.
 * @param headerActions - Optional controls rendered in the board header.
 * @param className - Extra classes for the board wrapper.
 * @returns The player board.
 */
export function PlayerBoard({
  title,
  players,
  width,
  keyPrefix,
  isPlayerScoreChanged,
  tone = 'mine',
  headerActions,
  className,
}: {
  title: string;
  players: GroupedPlayer[];
  width: BoardWidth;
  keyPrefix: string;
  isPlayerScoreChanged: (player: GroupedPlayer) => boolean;
  tone?: 'mine' | 'opponent';
  headerActions?: React.ReactNode;
  className?: string;
}) {
  const [showBench, setShowBench] = useState(false);

  const { starters, bench, startersByPosition, startersTotal } = useMemo(() => {
    const starterPlayers = players.filter((player) => !player.onBench).sort(byScoreDescending);
    const benchPlayers = players.filter((player) => player.onBench).sort(byScoreDescending);

    return {
      starters: starterPlayers,
      bench: benchPlayers,
      startersByPosition: groupPlayersByPosition(starterPlayers),
      startersTotal: sumScores(starterPlayers),
    };
  }, [players]);

  return (
    <div className={cn('min-w-0', tone === 'opponent' && 'opacity-90', className)}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {starters.length}
        </span>
        <span className="text-sm font-bold tabular-nums text-primary">{startersTotal.toFixed(1)}</span>
        {headerActions && <div className="ml-auto flex items-center gap-2">{headerActions}</div>}
      </div>

      <div className="space-y-3">
        {PLAYER_POSITIONS.map((position) => (
          <PositionBand
            key={position}
            label={position}
            players={(startersByPosition[position] ?? []).slice().sort(byScoreDescending)}
            width={width}
            keyPrefix={`${keyPrefix}-${position}`}
            isPlayerScoreChanged={isPlayerScoreChanged}
          />
        ))}

        {bench.length > 0 && (
          <section>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1.5 border-b border-border/60 px-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => setShowBench((previous) => !previous)}
              aria-expanded={showBench}
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showBench && '-rotate-90')} />
              Bench
              <span className="tabular-nums text-muted-foreground/70">{bench.length}</span>
            </Button>
            {showBench && (
              <div className={cn('mt-1.5', COLUMN_CLASSES[width])}>
                {bench.map((player) => (
                  <PlayerCard
                    key={`${keyPrefix}-bench-${player.id}-${player.name}`}
                    player={player}
                    isScoreChanged={isPlayerScoreChanged(player)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {starters.length === 0 && bench.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No players to show.
          </p>
        )}
      </div>
    </div>
  );
}
