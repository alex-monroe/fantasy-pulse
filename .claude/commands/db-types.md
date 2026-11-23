---
description: Regenerate Supabase TS types and the schema reference doc
---

Run after any change under `supabase/migrations/`.

The database is the self-hosted stack on the droplet (see
[../../docs/references/environment.md](../../docs/references/environment.md)).
Postgres listens only on the droplet's localhost, so tunnel to it.

1. Open a tunnel in the background. It needs the Bash sandbox off for ssh:
   ```bash
   ssh -N -L 54329:127.0.0.1:5432 sofa
   ```
2. Regenerate the TypeScript types. Read the password into a variable;
   never echo it:
   ```bash
   PGPW=$(ssh sofa 'grep -E "^POSTGRES_PASSWORD=" ~/supabase/.env | cut -d= -f2- | tr -d "\"\n"')
   npx supabase gen types typescript --db-url "postgresql://postgres:$PGPW@127.0.0.1:54329/postgres" --schema public > apps/web/src/lib/database.types.ts
   unset PGPW
   ```
   Migrations are applied the same way. Run them on the droplet with
   `docker exec -i supabase-db psql -h 127.0.0.1 -U postgres -d postgres`,
   then record the version in `supabase_migrations.schema_migrations`.
   The shared DB holds sofa-db's live data, so touch only `fp_*` objects.
3. Update the schema snapshot at
   [docs/references/database-schema.md](../../docs/references/database-schema.md)
   so agents reading the docs map see the new shape.
4. Commit the regenerated files alongside the migration in the same PR.

Don't use `--linked` / `supabase link`. The hosted project
`rbinbcwinchphipvcfqk` is the pre-2026-11-23 copy, and it's being cancelled.
