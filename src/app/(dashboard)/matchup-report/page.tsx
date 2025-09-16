import { getTeams } from "@/app/actions";
import { FantasyHeroes, PublicEnemies, DoubleAgents } from "./components";
import { processMatchups } from "./utils";

export default async function MatchupReport() {
  const { teams } = await getTeams();
  const { fantasyHeroes, publicEnemies, doubleAgents } = processMatchups(
    teams || []
  );

  return (
    <div className="container mx-auto p-4">
      <pre>{JSON.stringify(teams, null, 2)}</pre>
      <h1 className="text-3xl font-bold mb-4">Matchup Report</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FantasyHeroes players={fantasyHeroes} />
        <PublicEnemies players={publicEnemies} />
        <DoubleAgents players={doubleAgents} />
      </div>
    </div>
  );
}
