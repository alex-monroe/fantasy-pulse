# Yahoo Integration

This document explains how the Yahoo integration works.

## Integration Flow

The Yahoo integration allows users to connect their Yahoo Fantasy Sports account to the application. Once connected, the application can fetch data about the user's leagues, teams, and rosters.

The integration flow is as follows:

1.  **Authentication**: The user initiates the OAuth 2.0 flow to connect their Yahoo account. The application obtains an access token and a refresh token from Yahoo. These tokens are securely stored in the `user_integrations` table in the database.

2.  **Token Management**: When the application needs to access the Yahoo API, it first retrieves the user's access token from the database. If the token has expired, the application uses the refresh token to obtain a new access token from Yahoo. The new token is then updated in the database. This logic is handled in the `getYahooAccessToken` function in `src/app/integrations/yahoo/actions.ts`.

3.  **Data Fetching**: With a valid access token, the application can make requests to the Yahoo Fantasy Sports API to fetch data. The following functions in `src/app/integrations/yahoo/actions.ts` are responsible for fetching data:
    *   `getYahooLeagues`: Fetches the user's leagues.
    *   `getYahooUserTeams`: Fetches the user's teams.
    *   `getYahooRoster`: Fetches the roster for a specific team.

4.  **Data Storage**: The data fetched from the Yahoo API is then parsed and stored in the application's database. For example, league data is stored in the `leagues` table and team data is stored in the `teams` table. This allows the application to use the data without having to repeatedly call the Yahoo API.

## Data Formats

The data from the Yahoo API is returned in a deeply nested JSON format. The following sections describe the structure of the data for leagues, teams, and rosters.

### Leagues

The response from the `getYahooLeagues` function is structured as follows:

```json
{
  "fantasy_content": {
    "users": [
      {
        "user": [
          {},
          {
            "games": [
              {
                "game": [
                  {},
                  {
                    "leagues": {
                      "0": { "league": [] },
                      "1": { "league": [] },
                      "count": 2
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Teams

The response from the `getYahooUserTeams` function is structured as follows:

```json
{
  "fantasy_content": {
    "users": [
      {
        "user": [
          {},
          {
            "games": [
              {
                "game": [
                  {},
                  {
                    "teams": {
                      "0": { "team": [] },
                      "1": { "team": [] },
                      "count": 2
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Roster

The response from the `getYahooRoster` function is structured as follows:

```json
{
  "fantasy_content": {
    "team": [
      [],
      {
        "roster": {
          "0": {
            "players": {
              "0": { "player": [] },
              "1": { "player": [] },
              "count": 2
            }
          }
        }
      }
    ]
  }
}
```

### Player Scores

An example response from the Yahoo player scores API is available at
[docs/examples/yahoo-player-scores-response.json](../../../../docs/examples/yahoo-player-scores-response.json).
