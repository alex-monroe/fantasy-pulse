import { Roster } from "@/components/roster/roster";
import { League, Rosters, Player } from "@/lib/types";

const mockRoster: Rosters = {
  players: [
    {
      player_id: "1",
      first_name: "Patrick",
      last_name: "Mahomes",
      full_name: "Patrick Mahomes",
      position: "QB",
      team: "KC",
      injury_status: "N/A",
      avatar: "https://sleepercdn.com/content/nfl/players/4017.jpg",
    },
    {
      player_id: "2",
      first_name: "Christian",
      last_name: "McCaffrey",
      full_name: "Christian McCaffrey",
      position: "RB",
      team: "SF",
      injury_status: "N/A",
      avatar: "https://sleepercdn.com/content/nfl/players/4017.jpg",
    },
    {
      player_id: "3",
      first_name: "Justin",
      last_name: "Jefferson",
      full_name: "Justin Jefferson",
      position: "WR",
      team: "MIN",
      injury_status: "N/A",
      avatar: "https://sleepercdn.com/content/nfl/players/4017.jpg",
    },
    {
        player_id: "4",
        first_name: "Travis",
        last_name: "Kelce",
        full_name: "Travis Kelce",
        position: "TE",
        team: "KC",
        injury_status: "N/A",
        avatar: "https://sleepercdn.com/content/nfl/players/4017.jpg",
    },
    {
        player_id: "5",
        first_name: "A.J.",
        last_name: "Brown",
        full_name: "A.J. Brown",
        position: "WR",
        team: "PHI",
        injury_status: "N/A",
        avatar: "https://sleepercdn.com/content/nfl/players/4017.jpg",
    },
    {
        player_id: "6",
        first_name: "Ja'Marr",
        last_name: "Chase",
        full_name: "Ja'Marr Chase",
        position: "WR",
        team: "CIN",
        injury_status: "N/A",
        avatar: "https://sleepercdn.com/content/nfl/players/4017.jpg",
    },
    {
        player_id: "7",
        first_name: "Breece",
        last_name: "Hall",
        full_name: "Breece Hall",
        position: "RB",
        team: "NYJ",
        injury_status: "N/A",
        avatar: "https://sleepercdn.com/content/nfl/players/4017.jpg",
    },
  ],
  metadata: {
    record: "0-0",
    total_points: 100,
  },
};

const mockLeague: League = {
  id: "1",
  name: "Test League",
  avatar: "https://sleepercdn.com/avatars/thumbs/e1b3f8a70c3d9c2a2e3f8d3d9e8c3c1b",
  season: "2024",
  total_rosters: 12,
  status: "active",
  user_id: "1",
  user_integration_id: 1
};

export default function RosterTestPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Roster roster={mockRoster} league={mockLeague} />
    </div>
  );
}
