# Adding New Fantasy Provider Integrations

Four providers ship today — **Sleeper**, **Yahoo**, **Ottoneu** and
**ESPN**. This guide explains how to add a fifth.

Pick the closest existing provider to copy, because the four differ
mainly in how they authenticate:

| Provider | Auth | Data source |
| -------- | ---- | ----------- |
| Sleeper  | none — username only | public JSON API |
| Yahoo    | OAuth 2 (`api/auth/yahoo/route.ts`) | JSON API |
| Ottoneu  | none | scraped HTML (JSDOM) |
| ESPN     | two cookies pasted by the user | undocumented JSON API |

1. **Create provider module**
   - Add a folder at `apps/web/src/app/integrations/<provider>`.
   - Every provider folder follows the same shape:
     `actions.ts` (server actions), `actions.test.ts` (colocated tests),
     `page.tsx` (connect/manage UI), `README.md` (flow + payload shapes),
     and an `*.example.json` capture of the most useful API response
     where one applies.
   - Use the provider from the table above whose auth model matches
     yours as the reference.

2. **Handle authentication**
   - If OAuth is required, create `apps/web/src/app/api/auth/<provider>/route.ts` similar to `apps/web/src/app/api/auth/yahoo/route.ts`.
   - Add any required environment variables to `.env.example`.

3. **Build teams**
   - Implement `build<Provider>Teams` in
     `apps/web/src/app/integrations/<provider>/build-teams.ts`, returning
     `Team[]`. It imports its data functions from `./actions` and any
     shared infrastructure (week, scoreboard, Sleeper player list, name
     matching) from `@/lib/nfl/*` — never from another provider.
   - Register it in the `teamBuilders` map in
     `apps/web/src/app/actions.ts` and add a branch for the new
     `provider` value in `getTeams`.
   - Add the provider to the `FantasyProvider` union in
     `packages/core/src/types.ts`. A test asserts that union, the
     `integrations/` directory listing and the docs all agree.

4. **Expose in the UI**
   - Add a card linking to the new provider in `apps/web/src/app/integrations/page.tsx`.
   - Update mock data or types as needed, e.g. `packages/core/src/mock-data.ts (`@roster-loom/core`)`.

5. **Verify**
   - `npm run lint && npm run typecheck && npm test` — all three gate CI.
   - Do **not** run `npm run test:e2e` locally; see
     [TESTING.md](TESTING.md).
   - Exercise the new provider end to end with `npm run dev`, or without
     credentials via `DEMO_MODE=1 npm run dev` for the surrounding UI.

Following these steps will keep integrations consistent with the existing architecture and test coverage.
