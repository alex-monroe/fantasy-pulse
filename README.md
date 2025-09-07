# Fantasy Pulse

Fantasy Pulse is a Next.js application for tracking fantasy football matchups.
The project uses the App Router and Supabase for authentication and data storage.

To get started, take a look at `src/app/page.tsx`.

## Architecture

The codebase is split between server-side and client-side modules.

### Server-side

- Files in `src/app` are server components by default. Server actions such as
  `src/app/actions.ts` fetch data from Supabase and the Sleeper API.
- API routes under `src/app/api/**` run as serverless functions. For example,
  `src/app/api/auth/yahoo/route.ts` handles OAuth callbacks from Yahoo.
- `src/middleware.ts` executes on the server to keep Supabase session cookies in sync.
- Utilities like `src/utils/supabase/server.ts` create authenticated Supabase
  clients for server code.

### Client-side

- Interactive components live in `src/components` and use the "use client"
  directive (e.g. `src/components/home-page.tsx`).
- Custom hooks in `src/hooks` and the browser Supabase client in
  `src/utils/supabase/client.ts` run only in the browser.
- Pages that import client components, such as `/login` or `/integrations`,
  execute on the client for user interactions.

## Supabase Auth

This project uses [Supabase](https://supabase.com) for authentication. Provide the following environment variables to enable the login flow:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

You can sign in at `/login` with an email and password, sign up for a new account at `/register`, and sign out from the main page header.

## Yahoo Fantasy Football Integration

A basic structure for Yahoo Fantasy Football integration has been added. To complete the implementation, follow these steps:

### TODO

1.  **Register a new application with Yahoo:**
    *   Go to the [Yahoo Developer Network](https://developer.yahoo.com/apps/create/) and create a new application.
    *   Set the "Callback Domain" to your application's domain.
    *   Select "Fantasy Sports" as the API permission, with "Read" or "Read/Write" access.
    *   Once you have created the application, you will get a "Client ID" and "Client Secret".

2.  **Set up environment variables:**
    *   Create a `.env.local` file in the root of the project.
    *   Add the following environment variables to the file:
        ```
        YAHOO_CLIENT_ID=<your_yahoo_client_id>
        YAHOO_CLIENT_SECRET=<your_yahoo_client_secret>
        ```

3.  **Implement the OAuth 2.0 flow:**
    *   Update the `handleConnect` function in `src/app/integrations/yahoo/page.tsx` to redirect the user to the Yahoo authorization URL.
    *   Update the `src/app/api/auth/yahoo/route.ts` file to handle the callback from Yahoo. This includes:
        *   Exchanging the authorization code for an access token.
        *   Storing the access token, refresh token, and other relevant information in the `user_integrations` table in the database.
    *   Update the `connectYahoo` function in `src/app/integrations/yahoo/actions.ts` to use the access token to fetch the user's information from the Yahoo API.

4.  **Implement the API calls to fetch data:**
    *   Update the `getYahooLeagues` function in `src/app/integrations/yahoo/actions.ts` to fetch the user's leagues from the Yahoo Fantasy Sports API. You will need to use the access token to make authenticated requests.
    *   Implement a function to fetch players from a team's roster.

### Fetching the Correct Team ID

The current implementation for fetching a team's roster hardcodes the `team_id` to `'1'`. This is a temporary measure because the API call to fetch leagues does not return the user's `team_id` for each league. A proper implementation requires the following steps:

1.  **Create a New Server Action to Fetch Teams:**
    *   Implement a new function in `src/app/integrations/yahoo/actions.ts`, such as `getYahooUserTeams(integrationId: number)`.
    *   This function should call the Yahoo API endpoint to get all the teams associated with the user's account for the current game (e.g., `https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_key=nfl/teams?format=json`).
    *   It should use the `getYahooAccessToken` helper to ensure the request is authenticated.

2.  **Store Team Data:**
    *   The teams returned from the API should be stored in the database. This may require a new `teams` table or adding columns to the existing `leagues` table.
    *   A `teams` table would ideally store the `team_key`, `team_id`, `league_id`, `user_integration_id`, and other relevant team details like name and logo.

3.  **Update the Frontend Logic:**
    *   When the Yahoo integration page is loaded, the application should call the new `getYahooUserTeams` action to ensure the user's team data is synced and available.
    *   The `handleFetchRoster` function in `src/app/integrations/yahoo/page.tsx` must be modified.
    *   Instead of using a hardcoded `team_id`, it should look up the correct `team_id` from the stored team data that corresponds to the selected `league_id`.

4.  **Remove Hardcoded Value:**
    *   Once the correct `team_id` is being dynamically retrieved, the hardcoded `const teamId = '1';` line in `handleFetchRoster` should be removed.
