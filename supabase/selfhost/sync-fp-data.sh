#!/usr/bin/env bash
# Copy fantasy-pulse's data (and only fantasy-pulse's data) from the hosted
# Supabase project to the self-hosted stack at db.rosterloom.com.
#
# Runs ON THE DROPLET (`ssh sofa`), as user `deploy`. See
# docs/SELF_HOSTED_SUPABASE_MIGRATION.md for when and why.
#
#   ./sync-fp-data.sh check      # read-only: drift + safety checks, no writes
#   ./sync-fp-data.sh rehearse   # full load in one transaction, then ROLLBACK
#   ./sync-fp-data.sh apply      # same, but COMMIT (after a local backup)
#
# What it copies: every public.fp_* table, auth.users, auth.identities —
# read from hosted in a single REPEATABLE READ snapshot.
# What it clears without copying: every table that references those
# (auth.sessions, auth.refresh_tokens, mfa/oauth/webauthn tables, ...).
# Sessions and refresh tokens are useless under the new JWT secret.
#
# Safety rails (the shared DB holds sofa-db's live production data):
#   * The truncate set is the FK closure of the copied tables, computed on
#     the self-hosted DB. If that closure contains any table outside the
#     `auth` schema or `public.fp_*`, the script aborts. It never uses
#     TRUNCATE ... CASCADE.
#   * Aborts on any user-defined trigger on an auth table (unknown side
#     effects into other tables).
#   * Aborts if the fp_* table sets differ, if hosted has a column the
#     self-hosted table lacks, or if self-hosted has a NOT NULL column with
#     no default that hosted can't fill. Apply pending fp migrations first.
#   * Aborts if self-hosted has auth users that hosted doesn't (they'd be
#     deleted) unless ALLOW_DROP_LOCAL_USERS=1.
#   * Per-table row counts are asserted inside the transaction against the
#     counts taken in the same hosted snapshot; any mismatch rolls back.
#   * Never prints HOSTED_DB_URL; it's passed to docker by name only.
set -euo pipefail

MODE="${1:-}"
case "$MODE" in check|rehearse|apply) ;; *)
  echo "usage: $0 check|rehearse|apply" >&2; exit 2;;
esac

HOSTED_ENV="${HOSTED_ENV:-$HOME/supabase-migration/hosted.env}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
WORK_ROOT="${WORK_ROOT:-$HOME/supabase-migration}"

# shellcheck disable=SC1090
set -a; . "$HOSTED_ENV"; set +a
: "${HOSTED_DB_URL:?HOSTED_DB_URL missing from $HOSTED_ENV}"
export PGURL="$HOSTED_DB_URL"   # passed into the container by name, never in argv

hosted() { docker exec -i -e PGURL "$DB_CONTAINER" sh -c 'exec psql "$PGURL" -X -q -v ON_ERROR_STOP=1 -At "$@"' sh "$@"; }
local_() { docker exec -i "$DB_CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -At "$@"; }
die() { echo "ABORT: $*" >&2; exit 1; }

umask 077
WORK="$(mktemp -d "$WORK_ROOT/fp-sync-$(date -u +%Y%m%dT%H%M%SZ)-$MODE-XXXX")"
# data.sql / load.sql carry password hashes: never leave them behind.
trap 'rm -f "$WORK/data.sql" "$WORK/load.sql"' EXIT
echo "work dir: $WORK"

# ---------------------------------------------------------------- tables
FP_TABLES_SQL="select format('%I.%I', n.nspname, c.relname) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'fp\_%' order by 1"
hosted -c "$FP_TABLES_SQL" > "$WORK/fp.hosted"
local_ -c "$FP_TABLES_SQL" > "$WORK/fp.local"
diff "$WORK/fp.hosted" "$WORK/fp.local" >/dev/null || {
  diff "$WORK/fp.hosted" "$WORK/fp.local" >&2 || true
  die "fp_* table sets differ (< hosted, > self-hosted). Apply missing migrations first."
}
[ -s "$WORK/fp.hosted" ] || die "no fp_* tables found on hosted"
SEED="{auth.users,auth.identities,$(paste -sd, "$WORK/fp.hosted")}"
# Parents before children: rows are FK-checked as they load.
local_ -v seed="$SEED" > "$WORK/order.local" <<'SQL'
with recursive s(oid) as (select unnest(:'seed'::regclass[])::oid),
d(oid, depth) as (
  select oid, 0 from s
  union all
  select c.conrelid, d.depth + 1 from pg_constraint c
  join d on c.confrelid = d.oid
  where c.contype = 'f' and c.conrelid in (select oid from s) and c.conrelid <> c.confrelid
)
select format('%I.%I', n.nspname, k.relname)
from d join pg_class k on k.oid = d.oid join pg_namespace n on n.oid = k.relnamespace
group by 1 order by max(depth), 1;
SQL
COPY_TABLES=(); while read -r t; do COPY_TABLES+=("$t"); done < "$WORK/order.local"
echo "copy set (${#COPY_TABLES[@]}): ${COPY_TABLES[*]}"

# FK closure on self-hosted: everything that must be emptied with the copy set.
local_ -v seed="$SEED" > "$WORK/truncate.local" <<'SQL'
with recursive t(oid) as (
  select unnest(:'seed'::regclass[])::oid
  union
  select c.conrelid from pg_constraint c join t on c.confrelid = t.oid where c.contype = 'f'
)
select format('%I.%I', n.nspname, k.relname)
from t join pg_class k on k.oid = t.oid join pg_namespace n on n.oid = k.relnamespace
order by 1;
SQL
if grep -Ev '^(auth\..+|public\.fp_.+)$' "$WORK/truncate.local" >&2; then
  die "FK closure reaches tables outside auth / public.fp_* (listed above). Refusing."
fi
TRUNCATE_LIST="$(paste -sd, "$WORK/truncate.local")"
echo "truncate set ($(wc -l < "$WORK/truncate.local")): $TRUNCATE_LIST"

# User-defined triggers on anything we'll write.
local_ -v list="{$TRUNCATE_LIST}" > "$WORK/triggers.local" <<'SQL'
select format('%s %s', tgrelid::regclass, tgname) from pg_trigger
where not tgisinternal and tgrelid = any(:'list'::regclass[]) order by 1;
SQL
if [ -s "$WORK/triggers.local" ]; then
  echo "user triggers on target tables:"; sed 's/^/  /' "$WORK/triggers.local"
  grep -q '^auth\.' "$WORK/triggers.local" && die "trigger on an auth table; inspect it before syncing"
fi

# ---------------------------------------------------------------- columns
# table|column|notnull|hasdefault|generated
COLS_SQL="select format('%I.%I', n.nspname, c.relname)||'|'||a.attname||'|'||a.attnotnull||'|'||(a.atthasdef or a.attidentity <> '')||'|'||(a.attgenerated <> '')
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where a.attnum > 0 and not a.attisdropped
    and format('%I.%I', n.nspname, c.relname) = any(:'seed'::text[]) order by 1"
# (psql only interpolates :'vars' in stdin/-f input, not in -c.)
echo "$COLS_SQL;" | hosted -v seed="$SEED" | sort > "$WORK/cols.hosted"
echo "$COLS_SQL;" | local_ -v seed="$SEED" | sort > "$WORK/cols.local"

problems=0
: > "$WORK/collist"
for t in "${COPY_TABLES[@]}"; do
  hcols="$(awk -F'|' -v t="$t" '$1==t && $5=="false" {print $2}' "$WORK/cols.hosted" | sort)"
  lcols="$(awk -F'|' -v t="$t" '$1==t && $5=="false" {print $2}' "$WORK/cols.local" | sort)"
  only_h="$(comm -23 <(echo "$hcols") <(echo "$lcols") | grep -v '^$' || true)"
  only_l="$(comm -13 <(echo "$hcols") <(echo "$lcols") | grep -v '^$' || true)"
  if [ -n "$only_h" ]; then
    echo "DRIFT $t: hosted-only columns: $(echo $only_h)" >&2; problems=1
  fi
  for c in $only_l; do
    if awk -F'|' -v t="$t" -v c="$c" '$1==t && $2==c && $3=="true" && $4=="false" {f=1} END {exit !f}' "$WORK/cols.local"; then
      echo "DRIFT $t: self-hosted NOT NULL column '$c' has no default and no hosted source" >&2; problems=1
    fi
  done
  common="$(comm -12 <(echo "$hcols") <(echo "$lcols") | grep -v '^$' | sed 's/.*/"&"/' | paste -sd, -)"
  [ -n "$common" ] || { echo "DRIFT $t: no common columns" >&2; problems=1; }
  echo "$t|$common" >> "$WORK/collist"
done
[ "$problems" = 0 ] || die "schema drift (see above)"
echo "columns: OK (generated columns skipped; self-hosted-only columns take defaults)"

# ---------------------------------------------------------------- users
hosted -c "select id from auth.users order by 1" > "$WORK/users.hosted"
local_ -c "select id from auth.users order by 1" > "$WORK/users.local"
dropped="$(comm -13 "$WORK/users.hosted" "$WORK/users.local" | wc -l | tr -d ' ')"
added="$(comm -23 "$WORK/users.hosted" "$WORK/users.local" | wc -l | tr -d ' ')"
echo "auth.users: hosted=$(wc -l < "$WORK/users.hosted" | tr -d ' ') self-hosted=$(wc -l < "$WORK/users.local" | tr -d ' ') new-from-hosted=$added self-hosted-only=$dropped"
if [ "$dropped" != 0 ] && [ "${ALLOW_DROP_LOCAL_USERS:-0}" != 1 ]; then
  comm -13 "$WORK/users.hosted" "$WORK/users.local" | sed 's/^/  self-hosted-only user id: /' >&2
  die "self-hosted has users hosted doesn't; they would be deleted. Set ALLOW_DROP_LOCAL_USERS=1 if intended."
fi

if [ "$MODE" = check ]; then
  echo "check: all guards passed; nothing written."
  exit 0
fi

# ---------------------------------------------------------------- dump
# One hosted session, one snapshot: emit a psql load script on stdout.
{
  echo '\set ON_ERROR_STOP 1'
  echo 'begin isolation level repeatable read read only;'
  while IFS='|' read -r t cols; do
    printf "\\\\echo 'COPY %s (%s) FROM stdin;'\n" "$t" "$cols"
    printf 'copy (select %s from %s) to stdout;\n' "$cols" "$t"
    printf "\\\\echo '\\\\\\\\.'\n"
  done < "$WORK/collist"
  while IFS='|' read -r t _; do
    printf "select format('select pg_temp.assert_count(%%L, %%s);', '%s', count(*)) from %s;\n" "$t" "$t"
  done < "$WORK/collist"
  echo 'commit;'
} > "$WORK/dump-driver.sql"
hosted -f - < "$WORK/dump-driver.sql" > "$WORK/data.sql"
echo "dumped $(wc -c < "$WORK/data.sql" | tr -d ' ') bytes from hosted"

if [ "$MODE" = apply ]; then
  # Restorable copy of what we're about to replace (data only).
  args=(); while read -r t; do args+=(-t "$t"); done < "$WORK/truncate.local"
  docker exec "$DB_CONTAINER" pg_dump -h 127.0.0.1 -U postgres -d postgres --data-only "${args[@]}" > "$WORK/self-hosted-before.sql"
  echo "backup: $WORK/self-hosted-before.sql ($(wc -c < "$WORK/self-hosted-before.sql" | tr -d ' ') bytes)"
fi

END_STMT=rollback; [ "$MODE" = apply ] && END_STMT=commit
{
  echo '\set ON_ERROR_STOP 1'
  echo 'begin;'
  cat <<'SQL'
create function pg_temp.assert_count(t text, expected bigint) returns void language plpgsql as $f$
declare n bigint;
begin
  execute format('select count(*) from %s', t) into n;
  raise notice 'rows % self-hosted=% hosted=%', rpad(t, 34), n, expected;
  if n <> expected then raise exception 'row count mismatch on %: % vs %', t, n, expected; end if;
end $f$;
SQL
  echo "truncate table $TRUNCATE_LIST;"
  cat "$WORK/data.sql"
  # Bring owned sequences (serial / identity) of copied fp tables past the data.
  cat <<'SQL'
do $s$
declare r record; m bigint;
begin
  for r in
    select format('%I.%I', n.nspname, c.relname) tbl, a.attname col, s.oid::regclass seq
    from pg_depend d
    join pg_class s on s.oid = d.objid and s.relkind = 'S'
    join pg_class c on c.oid = d.refobjid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.refobjsubid
    where n.nspname = 'public' and c.relname like 'fp\_%'
  loop
    execute format('select max(%I) from %s', r.col, r.tbl) into m;
    perform setval(r.seq, coalesce(m, 0) + 1, false);
    raise notice 'sequence % -> next %', r.seq, coalesce(m, 0) + 1;
  end loop;
end $s$;
SQL
  echo "$END_STMT;"
} > "$WORK/load.sql"

local_ -f - < "$WORK/load.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //' | tee "$WORK/load.log"
echo "$MODE: done ($END_STMT). Log: $WORK/load.log"
