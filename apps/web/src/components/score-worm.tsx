'use client';

import { useId, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { formatWinProbability, type WormPoint } from '@roster-loom/core';

const WIDTH = 200;
const HEIGHT = 44;
const PAD = 2;

/**
 * A matchup's score worm, small enough for a scoreboard tile: the user's
 * win probability after every scoring play of the week, drawn from the
 * shared play-by-play feed (ottoneu-db's live worm model). Above the
 * midline you're favoured; below it you're not.
 *
 * Like ottoneu-db's worm, the x-axis is the sequence of scoring plays, not
 * clock time — on a clock axis Thursday night would sit alone at the far
 * left and Sunday afternoon would be squashed into a sliver.
 *
 * Hovering (or focusing) the chart reads out the play under the pointer.
 *
 * @param worm - The matchup's worm points, oldest first.
 * @param teamName - The user's team, for the readout.
 * @param opponentName - The opponent, for the readout.
 * @param approximate - Whether the plays were scored with a stock profile
 *   rather than the league's own settings.
 */
export function ScoreWorm({
  worm,
  teamName,
  opponentName,
  approximate,
}: {
  worm: WormPoint[];
  teamName: string;
  opponentName: string;
  approximate: boolean;
}) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const path = useMemo(() => {
    if (worm.length < 2) return null;
    const x = (i: number) => PAD + (i / (worm.length - 1)) * (WIDTH - PAD * 2);
    const y = (p: number) => PAD + (1 - p) * (HEIGHT - PAD * 2);
    const line = worm.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.winProbability).toFixed(1)}`).join(' ');
    const area = `${line} L${x(worm.length - 1).toFixed(1)},${y(0.5).toFixed(1)} L${x(0).toFixed(1)},${y(0.5).toFixed(1)} Z`;
    return { line, area, x, y };
  }, [worm]);

  if (!path) {
    return null;
  }

  const shown = worm[hovered ?? worm.length - 1];
  const last = worm[worm.length - 1];

  const pick = (clientX: number, rect: DOMRect) => {
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHovered(Math.round(ratio * (worm.length - 1)));
  };

  return (
    <figure data-testid="score-worm" className="mt-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-11 w-full touch-none"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Win probability over ${worm.length - 1} scoring plays, now ${formatWinProbability(last.winProbability)}`}
        tabIndex={0}
        onPointerMove={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHovered(null)}
        onBlur={() => setHovered(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setHovered((h) => Math.max(0, (h ?? worm.length - 1) - 1));
          if (event.key === 'ArrowRight') setHovered((h) => Math.min(worm.length - 1, (h ?? worm.length - 1) + 1));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.35" />
            <stop offset="50%" stopColor="rgb(16 185 129)" stopOpacity="0" />
            <stop offset="50%" stopColor="rgb(239 68 68)" stopOpacity="0" />
            <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <line
          x1={PAD}
          x2={WIDTH - PAD}
          y1={path.y(0.5)}
          y2={path.y(0.5)}
          className="stroke-muted-foreground/40"
          strokeDasharray="2 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path d={path.area} fill={`url(#${gradientId})`} />
        <path
          d={path.line}
          fill="none"
          className="stroke-foreground/80"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hovered !== null && (
          <line
            x1={path.x(hovered)}
            x2={path.x(hovered)}
            y1={0}
            y2={HEIGHT}
            className="stroke-primary"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <figcaption className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] leading-tight text-muted-foreground">
        <span className="min-w-0 truncate" data-testid="score-worm-note">
          {shown.note}
        </span>
        <span
          className={cn(
            'flex-shrink-0 tabular-nums',
            shown.winProbability > 0.5 ? 'text-emerald-400' : shown.winProbability < 0.5 ? 'text-red-400' : ''
          )}
        >
          {`${shown.team.toFixed(1)}–${shown.opponent.toFixed(1)} · ${formatWinProbability(shown.winProbability)}`}
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>
          {`Score worm: ${teamName} vs ${opponentName}${approximate ? ' (approximate scoring)' : ''}`}
        </caption>
        <thead>
          <tr>
            <th>Play</th>
            <th>{teamName}</th>
            <th>{opponentName}</th>
            <th>Win probability</th>
          </tr>
        </thead>
        <tbody>
          {worm.map((point, index) => (
            <tr key={`${point.at}-${index}`}>
              <td>{point.note}</td>
              <td>{point.team.toFixed(2)}</td>
              <td>{point.opponent.toFixed(2)}</td>
              <td>{formatWinProbability(point.winProbability)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
