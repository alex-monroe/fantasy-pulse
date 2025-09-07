# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

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
        YAHOO_REDIRECT_URI=<https://your-domain.com/api/auth/yahoo>
        NEXT_PUBLIC_YAHOO_REDIRECT_URI=<https://your-domain.com/api/auth/yahoo>
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
