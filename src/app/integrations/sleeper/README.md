# Sleeper Integration

This document explains how the Sleeper integration works.

## Integration Flow

The Sleeper integration allows users to connect their Sleeper account to the application. Once connected, the application can fetch data about the user's leagues, teams, and rosters.

The integration flow is as follows:

1.  **Authentication**: The user provides their Sleeper username. The application uses this to fetch the user's account information from the Sleeper API. The user's Sleeper ID is then securely stored in the `user_integrations` table in the database.

2.  **Data Fetching**: With the user's Sleeper ID, the application can make requests to the Sleeper API to fetch data. The following functions in `src/app/integrations/sleeper/actions.ts` are responsible for fetching data:
    *   `getSleeperLeagues`: Fetches the user's leagues for the current season.
    *   `getRosters`: Fetches the rosters for a specific league.
    *   `getNflPlayers`: Fetches all NFL players from the Sleeper API.

3.  **Data Storage**: The data fetched from the Sleeper API is then parsed and stored in the application's database. For example, league data is stored in the `leagues` table. This allows the application to use the data without having to repeatedly call the Sleeper API.

## Data Formats

The data from the Sleeper API is returned in a JSON format. The following sections describe the structure of the data for rosters and players.

### Rosters

The response from the `getRosters` function is an array of roster objects, each structured as follows:

```json
[
  {
    "starters": ["player_id_1", "player_id_2", ...],
    "settings": {
      "wins": 5,
      "waiver_position": 10,
      ...
    },
    "roster_id": 1,
    "reserve": ["player_id_3", "player_id_4", ...],
    "players": ["player_id_1", "player_id_2", ...],
    "player_map": {
      "player_id_1": {
        "player_id": "player_id_1",
        ...
      },
      ...
    },
    "owner_id": "owner_user_id",
    "league_id": "league_id",
    ...
  }
]
```

### Players

The response from the `getNflPlayers` function is an object where each key is a player's ID, and the value is an object containing the player's details:

```json
{
  "player_id_1": {
    "player_id": "player_id_1",
    "first_name": "John",
    "last_name": "Doe",
    "position": "QB",
    "team": "DAL",
    ...
  },
  "player_id_2": {
    "player_id": "player_id_2",
    "first_name": "Jane",
    "last_name": "Smith",
    "position": "WR",
    "team": "PHI",
    ...
  },
  ...
}
```
