import { Roster } from "@/components/roster/roster";
import { getLeague, getRoster } from "@/lib/utils";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { League, Rosters } from "@/lib/types";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: { league_id: string; user_id: string; team_id: string };
}) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const league_id = searchParams.league_id;
  const user_id = searchParams.user_id;
  const team_id = searchParams.team_id;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const roster: Rosters = await getRoster(
    league_id,
    user_id,
    team_id,
    session?.provider_token || "",
    session?.provider_refresh_token || ""
  );

  const league: League = await getLeague(
    league_id,
    session?.provider_token || "",
    session?.provider_refresh_token || ""
  );

  return (
    <div className="flex flex-col gap-4">
      <Roster roster={roster} league={league} />
    </div>
  );
}
