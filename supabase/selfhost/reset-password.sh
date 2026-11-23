#!/usr/bin/env bash
# Admin password reset for a fantasy-pulse user on the self-hosted Supabase.
# The stack has no SMTP, so the emailed reset flow is switched off in the
# app (apps/web/src/lib/password-reset.ts). This script is the replacement.
#
# Runs ON THE DROPLET (`ssh sofa`):
#
#   ./reset-password.sh user@example.com                    # random temp password, printed once
#   ./reset-password.sh user@example.com --password-stdin   # read the new password from stdin
#
# Send the temporary password to the user out of band. They can change it
# from the app once signed in. Their other sessions keep working until their
# tokens expire.
#
# Touches only auth.users, through GoTrue's admin API. Never prints the
# service-role key: curl reads it from a config on stdin, not argv.
set -euo pipefail

EMAIL="${1:-}"; MODE="${2:-}"
[ -n "$EMAIL" ] || { echo "usage: $0 <email> [--password-stdin]" >&2; exit 2; }

SUPABASE_ENV="${SUPABASE_ENV:-$HOME/supabase/.env}"
API="${API:-https://db.rosterloom.com}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

KEY="$(grep -E '^SERVICE_ROLE_KEY=' "$SUPABASE_ENV" | head -1 | cut -d= -f2- | tr -d '"')"
[ -n "$KEY" ] || { echo "SERVICE_ROLE_KEY not found in $SUPABASE_ENV" >&2; exit 1; }

ID="$(docker exec -i "$DB_CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -X -q -At \
  -v email="$EMAIL" <<'SQL'
select id from auth.users where lower(email) = lower(:'email') and deleted_at is null;
SQL
)"
[ -n "$ID" ] || { echo "no user with email $EMAIL" >&2; exit 1; }
[ "$(echo "$ID" | wc -l)" = 1 ] || { echo "more than one user matches $EMAIL" >&2; exit 1; }

if [ "$MODE" = --password-stdin ]; then
  IFS= read -r PASSWORD
  GENERATED=0
else
  PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  GENERATED=1
fi
[ "${#PASSWORD}" -ge 6 ] || { echo "password must be at least 6 characters" >&2; exit 1; }

umask 077
BODY_FILE="$(mktemp)"; trap 'rm -f "$BODY_FILE"' EXIT
jq -cn --arg p "$PASSWORD" '{password: $p}' > "$BODY_FILE"   # file, not argv
STATUS="$(printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$KEY" "$KEY" \
  | curl -sS -K - -o /dev/null -w '%{http_code}' -X PUT \
      -H 'Content-Type: application/json' --data-binary "@$BODY_FILE" \
      "$API/auth/v1/admin/users/$ID")"

if [ "$STATUS" != 200 ]; then
  echo "GoTrue admin API returned HTTP $STATUS; password unchanged" >&2
  exit 1
fi
echo "password reset for $EMAIL ($ID)"
[ "$GENERATED" = 1 ] && echo "temporary password: $PASSWORD"
exit 0
