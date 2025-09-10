import { getTeams } from './actions';
import HomePage from '@/components/home-page';
import { createClient } from '@/utils/supabase/server';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { teams } = await getTeams();

  return <HomePage teams={teams || []} user={user} />;
}
