import { buildViewingGuide } from "@roster-loom/core";

import { getTeams } from "@/app/actions";
import { AppNavigation } from "@/components/app-navigation";
import { ViewingGuideSlots } from "./components";

export default async function ViewingGuide() {
  const { teams } = await getTeams();
  const slots = buildViewingGuide(teams || []);

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto space-y-6 p-4 sm:p-6 md:p-8">
          <div>
            <h1 className="text-3xl font-bold">Viewing Guide</h1>
            <p className="text-muted-foreground">
              Games still to play, by kickoff slot. The game with the most
              starters across your matchups (yours and your opponents&apos;
              combined) is the top pick for the TV.
            </p>
          </div>
          <ViewingGuideSlots slots={slots} />
        </div>
      </main>
    </div>
  );
}
