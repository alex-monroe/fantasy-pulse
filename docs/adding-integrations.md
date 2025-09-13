# Adding New Fantasy Provider Integrations

This guide explains how to add support for providers beyond Yahoo and Sleeper.

1. **Create provider module**
   - Add a folder at `src/app/integrations/<provider>`.
   - Include `actions.ts` for API calls and database updates.
   - Include `page.tsx` for the integration UI.
   - Use `src/app/integrations/sleeper` and `src/app/integrations/yahoo` as references.

2. **Handle authentication**
   - If OAuth is required, create `src/app/api/auth/<provider>/route.ts` similar to `src/app/api/auth/yahoo/route.ts`.
   - Add any required environment variables to `.env.example`.

3. **Update shared actions**
   - Implement a helper like `build<Provider>Teams` in `src/app/actions.ts`.
   - Export any provider-specific functions and add corresponding tests in `src/app/actions.test.ts`.

4. **Expose in the UI**
   - Add a card linking to the new provider in `src/app/integrations/page.tsx`.
   - Update mock data or types as needed, e.g. `src/lib/mock-data.ts`.

5. **Verify**
   - Run `npm test` and `npm run test:e2e` to confirm everything works.

Following these steps will keep integrations consistent with the existing architecture and test coverage.
