---
description: Regenerate Supabase TS types and the schema reference doc
---

Run after any change under `supabase/migrations/`.

1. Make sure the local Supabase project is linked:
   ```bash
   npx supabase status
   ```
2. Regenerate TypeScript types:
   ```bash
   npx supabase gen types typescript --linked > src/lib/database.types.ts
   ```
3. Update the schema snapshot at
   [docs/references/database-schema.md](../../docs/references/database-schema.md)
   so agents reading the docs map see the new shape.
4. Commit the regenerated files alongside the migration in the same PR.

If `--linked` fails, the project isn't linked yet — run
`npx supabase link --project-ref rbinbcwinchphipvcfqk` (the OttoneuDB
project; see [../../docs/references/environment.md](../../docs/references/environment.md)).
