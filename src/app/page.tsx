import { getTeams } from './actions';
import HomePage from '@/components/home-page';
import { logDuration, startTimer } from '@/utils/performance-logger';
import { createClient } from '@/utils/supabase/server';

/**
 * The home page of the application.
 * @returns The home page.
 */
export default async function Home() {
  const overallStart = startTimer();
  console.log('[performance] Home page render invoked');

  const supabase = createClient();
  const userStart = startTimer();
  const { data: { user } } = await supabase.auth.getUser();
  logDuration('Home page: fetch user', userStart, { hasUser: Boolean(user) });

  const teamsStart = startTimer();
  const teamsResult = await getTeams();
  const teams =
    'teams' in teamsResult && Array.isArray(teamsResult.teams)
      ? teamsResult.teams
      : [];
  const teamsError = 'error' in teamsResult ? teamsResult.error : undefined;
  const resultType = teams.length > 0 ? 'teams' : teamsError ? 'error' : 'empty';
  logDuration('Home page: getTeams', teamsStart, {
    teamCount: teams.length,
    hasError: Boolean(teamsError),
    resultType,
  });

  logDuration('Home page total', overallStart, {
    teamCount: teams.length,
    hasError: Boolean(teamsError),
    hasUser: Boolean(user),
    resultType,
  });

  return <HomePage teams={teams} user={user} />;
}
