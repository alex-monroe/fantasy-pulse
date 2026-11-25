import { redirect } from 'next/navigation';

import { AppNavigation } from '@/components/app-navigation';

import { getLeagueViews } from './actions';
import { LeagueList } from './components';

export const dynamic = 'force-dynamic';

/** Every league the user has connected, with how each one scores. */
export default async function LeaguesPage() {
  const result = await getLeagueViews();
  if ('error' in result && result.error === 'You must be logged in.') {
    redirect('/login');
  }
  const leagues = 'leagues' in result ? result.leagues : [];

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto space-y-6 p-4 sm:p-6 md:p-8">
          <div>
            <h1 className="text-3xl font-bold">Leagues</h1>
            <p className="text-muted-foreground">
              How each of your leagues scores. Sleeper, Yahoo, ESPN and Ottoneu settings are read from the
              provider; when a read fails, they&apos;re inferred from the league&apos;s past scores.
            </p>
          </div>
          {'error' in result && <p className="text-destructive">{result.error}</p>}
          <LeagueList
            leagues={leagues.map(({ league, teamName, scoring }) => ({
              provider: league.provider,
              leagueId: league.providerLeagueId,
              name: league.name,
              teamName,
              scoring,
            }))}
          />
        </div>
      </main>
    </div>
  );
}
