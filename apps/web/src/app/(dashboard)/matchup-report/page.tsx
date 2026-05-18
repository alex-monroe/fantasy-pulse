import { getTeams } from "@/app/actions";
import { AppNavigation } from "@/components/app-navigation";
import { FantasyHeroes, PublicEnemies, DoubleAgents } from "./components";
import { processMatchups } from "./utils";

export default async function MatchupReport() {
  const { teams } = await getTeams();
  const { fantasyHeroes, publicEnemies, doubleAgents } = processMatchups(
    teams || []
  );

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto space-y-6 p-4 sm:p-6 md:p-8">
          <h1 className="text-3xl font-bold">Matchup Report</h1>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FantasyHeroes players={fantasyHeroes} />
            <PublicEnemies players={publicEnemies} />
            <DoubleAgents players={doubleAgents} />
          </div>
        </div>
      </main>
    </div>
  );
}
