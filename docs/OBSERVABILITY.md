# Observability: debugging a user report

Server code logs structured JSON with `pino` (`apps/web/src/utils/logger.ts`).
Vercel Runtime Logs ingests it: `warn` and above go to stderr (so they show
as Warning/Error and can be filtered by level), the rest to stdout.

## Answering "it's not working for user X"

1. Get the user's id (Supabase dashboard → Auth → Users, or `auth.users`).
2. In Vercel → project → Logs, search the user id. Every line about that
   user's integrations carries `userId`, and usually `provider`,
   `integrationId` and `leagueId`.
3. Filter to Warning + Error first. The messages you're most likely to hit:

| Message | Meaning |
| --- | --- |
| `getTeams: integration produced no teams` | Connected, but nothing rendered. Look at the lines just before it for the reason. |
| `Sleeper: league skipped, user has no roster in it` | Sleeper user id no longer owns a roster in that league. |
| `Sleeper: league skipped, no matchup found for the current week` | Sleeper returned no matchup for the week (bye, offseason, playoffs). |
| `Sleeper: league skipped, unexpected API response` | Sleeper returned a non-array (rate limit or outage). |
| `Yahoo: could not fetch access token` / `getTeams: Yahoo returned no teams` | Token refresh failed. The user probably needs to reconnect. |
| `Ottoneu: failed to fetch ... page` | Ottoneu page fetch or scrape failed; `err` has the cause. |
| `Unhandled server error` | A render, route or server action threw. |

## Error references

When a page crashes, `app/error.tsx` shows the user a `Reference:` code.
That is the Next.js error `digest`; search it in Vercel Logs to find the
`Unhandled server error` entry with the stack (`src/instrumentation.ts`).

## Adding logs

- Use `logger`, not `console`. Errors go under `err` so the stack is kept.
- Tie a line to a user with `logger.child({ userId })` or pass `userId`.
- Never log tokens, cookies or full provider response bodies.
- A `catch` that returns a fallback should log first.

## Limits

Vercel keeps runtime logs for a short time (plan-dependent, from about an
hour to a few days), so a report about something that happened last week
can't be answered from them. Vercel Log Drains keep logs longer on plans
that support them.
