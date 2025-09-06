import { getTeams } from './actions';
import HomePage from '@/components/home-page';

export default async function Home() {
  const { teams } = await getTeams();

  return <HomePage teams={teams || []} />;
}
