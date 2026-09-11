import Image from 'next/image';
import { Newspaper } from 'lucide-react';
import type { PlayerNewsDigest, PlayerNewsItem } from '@roster-loom/core';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Renders a timestamp as an at-a-glance age ("4h ago").
 *
 * Deliberately coarse: news value drops off fast, so the useful question
 * is "is this from today?", not the exact minute. Rendered on the server
 * from a fixed `now` so the markup is stable between server and client.
 *
 * @param iso - The item's publication time, ISO 8601.
 * @param nowMs - The moment to measure against.
 * @returns A short relative age, or `null` when the date is unusable.
 */
export function formatNewsAge(iso: string | null, nowMs: number): string | null {
  if (!iso) {
    return null;
  }

  const publishedMs = new Date(iso).getTime();
  if (Number.isNaN(publishedMs)) {
    return null;
  }

  const minutes = Math.round((nowMs - publishedMs) / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** The headshot, or stacked initials when the roster carried no image. */
function PlayerAvatar({ name, imageUrl }: { name: string; imageUrl: string }) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 shrink-0 rounded-full bg-muted object-cover"
        unoptimized
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div
      aria-hidden
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
    >
      {initials}
    </div>
  );
}

function NewsEntry({ item, nowMs }: { item: PlayerNewsItem; nowMs: number }) {
  const age = formatNewsAge(item.publishedAt, nowMs);

  return (
    <li className="border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {item.link ? (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium leading-snug hover:underline"
          >
            {item.headline}
          </a>
        ) : (
          <span className="font-medium leading-snug">{item.headline}</span>
        )}
        {age ? (
          <span className="text-xs text-muted-foreground">{age}</span>
        ) : null}
        {item.matchedBy === 'mention' ? (
          <Badge variant="outline" className="text-[10px] font-normal">
            mentioned
          </Badge>
        ) : null}
      </div>
      {item.summary ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {item.summary}
        </p>
      ) : null}
    </li>
  );
}

/** One player and every recent item about them. */
export function PlayerNewsCard({
  entry,
  nowMs,
}: {
  entry: PlayerNewsDigest;
  nowMs: number;
}) {
  const leagues = entry.rosteredIn
    .map((spot) => spot.leagueName ?? spot.teamName)
    .filter((label, index, all) => all.indexOf(label) === index);

  const startingCount = entry.rosteredIn.filter((spot) => spot.starting).length;

  return (
    <Card className={cn(entry.opponentOnly && 'border-destructive/40')}>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
        <PlayerAvatar name={entry.playerName} imageUrl={entry.imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold leading-tight">
              {entry.playerName}
            </h2>
            <span className="text-xs text-muted-foreground">
              {[entry.position, entry.nflTeam].filter(Boolean).join(' · ')}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {entry.opponentOnly ? (
              <span className="text-destructive">
                On {entry.onOpponentTeams === 1 ? 'an opponent' : `${entry.onOpponentTeams} opponents`}
              </span>
            ) : (
              <>
                {startingCount > 0 ? `Starting in ${startingCount} of ` : 'Benched in all '}
                {entry.rosteredIn.length}
                {entry.rosteredIn.length === 1 ? ' league' : ' leagues'}
                {leagues.length > 0 ? ` · ${leagues.join(', ')}` : null}
              </>
            )}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {entry.items.map((item) => (
            <NewsEntry key={item.guid} item={item} nowMs={nowMs} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The zero state, which has three distinct causes worth telling apart. */
export function NewsDigestEmptyState({
  reason,
}: {
  reason: 'no-teams' | 'no-news' | 'error';
}) {
  const copy = {
    'no-teams': {
      title: 'No rosters connected yet',
      body: 'Connect a Sleeper, Yahoo, Ottoneu or ESPN account from the Integrations page and your players’ news will show up here.',
    },
    'no-news': {
      title: 'No news for your players',
      body: 'Nothing in the last week mentions anyone on your rosters. Check back after the next practice report.',
    },
    error: {
      title: 'Could not load the news feed',
      body: 'The news pool is temporarily unavailable. Your rosters are unaffected — try again in a few minutes.',
    },
  }[reason];

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <Newspaper className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{copy.body}</p>
      </CardContent>
    </Card>
  );
}
