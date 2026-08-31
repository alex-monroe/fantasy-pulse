---
description: Regenerate Supabase TS types and the schema reference doc
---

Run after any change under `supabase/migrations/`.

## Against the local stack (preferred)

Needs Docker. Works offline and never touches the shared project.

```bash
npm run db:start                                   # or db:reset if already running
npx supabase gen types typescript --local > apps/web/src/lib/database.types.ts
```

## Against the hosted project

```bash
npx supabase status                                # confirm the project is linked
npx supabase gen types typescript --linked > apps/web/src/lib/database.types.ts
```

If `--linked` fails, the project isn't linked yet — run
`npx supabase link --project-ref rbinbcwinchphipvcfqk` (the OttoneuDB
project; see [../../docs/references/environment.md](../../docs/references/environment.md)).

## Then

1. Wire the generated type through the Supabase clients if it isn't
   already: `createServerClient<Database>(...)` in
   `apps/web/src/utils/supabase/server.ts` and the equivalent in
   `client.ts` and `api.ts`. Without that parameter the file is
   generated but unused, and every `from('fp_…')` call still returns
   `any`.
2. Update the schema snapshot at
   [docs/references/database-schema.md](../../docs/references/database-schema.md)
   — tables, the RLS section, **and** the functions table. Functions are
   invisible to anyone browsing tables, so they rot silently.
3. Run `npm run typecheck` — newly-typed queries surface real column
   mismatches here.
4. Commit the regenerated files alongside the migration in the same PR.

> **Status:** `apps/web/src/lib/database.types.ts` has never been
> committed, so no Supabase query in the repo is typed today. Generating
> it needs either Docker or access to the linked project. See
> [docs/ONBOARDING_AUDIT.md](../../docs/ONBOARDING_AUDIT.md) Phase 4.
