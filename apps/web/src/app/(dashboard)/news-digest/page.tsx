import Link from 'next/link';
import { cookies } from 'next/headers';

import { getTeams } from '@/app/actions';
import { AppNavigation } from '@/components/app-navigation';
import { Badge } from '@/components/ui/badge';
import { DEMO_COOKIE, resolveDemoMode } from '@/lib/demo-mode';
import { getNewsDigest } from '@/lib/news/digest';
import { logDuration, startTimer } from '@/utils/performance-logger';
import { cn } from '@/lib/utils';
import {
  NewsDigestEmptyState,
  PlayerNewsCard,
  formatNewsAge,
} from './components';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'News Digest',
  description: 'Recent NFL news for every player on your fantasy rosters.',
};

/**
 * The News Digest page: every recent news item about a player the user
 * rosters, grouped by player and ordered by how fresh the news is.
 *
 * The news pool itself is shared and user-agnostic; the personalization
 * is the match against `getTeams()`, which happens per render. See
 * docs/NEWS_DIGEST.md.
 *
 * @param searchParams.opponents - `1` also surfaces news about players on
 *   this week's opposing rosters.
 */
export default async function NewsDigest({
  searchParams,
}: {
  searchParams?: Promise<{ opponents?: string }>;
}) {
  const overallStart = startTimer();

  const params = (await searchParams) ?? {};
  const includeOpponents = params.opponents === '1';

  const cookieStore = await cookies();
  const demo = resolveDemoMode({
    cookieValue: cookieStore.get(DEMO_COOKIE)?.value,
  });

  const teamsResult = await getTeams(undefined, undefined, { demo });
  const teams =
    'teams' in teamsResult && Array.isArray(teamsResult.teams)
      ? teamsResult.teams
      : [];

  const { digest, lastIngestedAt, error } = await getNewsDigest(teams, {
    demo,
    includeOpponents,
  });

  const nowMs = Date.now();
  const updatedLabel = formatNewsAge(lastIngestedAt, nowMs);

  logDuration('News digest page total', overallStart, {
    teamCount: teams.length,
    playerCount: digest.length,
    includeOpponents,
    hasError: Boolean(error),
  });

  const emptyReason = error
    ? 'error'
    : teams.length === 0
      ? 'no-teams'
      : digest.length === 0
        ? 'no-news'
        : null;

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto space-y-6 p-4 sm:p-6 md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">News Digest</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Recent NFL news for the players on your rosters
                {updatedLabel ? ` · feed updated ${updatedLabel}` : null}
              </p>
            </div>

            {/*
              A link rather than a client-side toggle: the whole page is a
              server render over `getTeams()`, so flipping the filter has
              to re-run that anyway.
            */}
            <div className="flex items-center gap-2 text-sm">
              <FilterLink href="/news-digest" active={!includeOpponents}>
                Your players
              </FilterLink>
              <FilterLink href="/news-digest?opponents=1" active={includeOpponents}>
                Include opponents
              </FilterLink>
            </div>
          </div>

          {demo ? (
            <Badge variant="outline" className="font-normal">
              Demo mode — this news is generated, not real
            </Badge>
          ) : null}

          {emptyReason ? (
            <NewsDigestEmptyState reason={emptyReason} />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {digest.map((entry) => (
                <PlayerNewsCard
                  key={entry.playerKey}
                  entry={entry}
                  nowMs={nowMs}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md border px-3 py-1.5 transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}
