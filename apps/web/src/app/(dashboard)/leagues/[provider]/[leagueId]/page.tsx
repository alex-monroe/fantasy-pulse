import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppNavigation } from '@/components/app-navigation';

import { getLeagueViews, recheckLeagueScoring } from '../../actions';
import { LeagueScoringDetail, providerName } from '../../components';

export const dynamic = 'force-dynamic';

/** One league's configuration: its scoring settings and where they came from. */
export default async function LeaguePage({
  params,
}: {
  params: Promise<{ provider: string; leagueId: string }>;
}) {
  const { provider, leagueId: rawLeagueId } = await params;
  const leagueId = decodeURIComponent(rawLeagueId);

  const result = await getLeagueViews();
  if ('error' in result) {
    if (result.error === 'You must be logged in.') redirect('/login');
  }
  const view =
    'leagues' in result
      ? result.leagues.find((entry) => entry.league.provider === provider && entry.league.providerLeagueId === leagueId)
      : undefined;
  if (!view) notFound();

  const { league, teamName, scoring } = view;
  const canRecheck = league.provider !== 'sleeper' && league.provider !== 'demo';

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto space-y-6 p-4 sm:p-6 md:p-8">
          <div>
            <Link href="/leagues" className="text-sm text-muted-foreground hover:underline">
              ← All leagues
            </Link>
            <h1 className="mt-1 text-3xl font-bold">{league.name}</h1>
            <p className="text-muted-foreground">
              {providerName(league.provider)}
              {league.season ? ` · ${league.season} season` : ''}
              {league.totalRosters ? ` · ${league.totalRosters} teams` : ''} · {teamName}
            </p>
          </div>
          <LeagueScoringDetail
            provider={league.provider}
            leagueId={league.providerLeagueId}
            scoring={scoring}
            recheck={canRecheck ? recheckLeagueScoring : undefined}
          />
        </div>
      </main>
    </div>
  );
}
