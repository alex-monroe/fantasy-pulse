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
| `Sleeper: some leagues did not produce a team` | One line per render listing `leaguesListed`, `teamsBuilt` and a `skipped` array with each missing league's id, name and reason. See below. |
| `Yahoo token refresh error` | Refresh failed; `error` and `httpStatus` say why. `invalid_grant` means Yahoo revoked the token and the user must reconnect. |
| `Yahoo: no teams in API response` | Login and token are fine but Yahoo listed no teams. See below. |
| `Yahoo: response had a teams object but no usable teams` | Yahoo returned a teams object with nothing parseable in it. |
| `Yahoo API Error fetching teams` | Yahoo rejected the request; check `httpStatus`. |
| `Ottoneu: failed to fetch ... page` | Ottoneu page fetch or scrape failed; `err` has the cause. |
| `Unhandled server error` | A render, route or server action threw. |

## Common cases

**Only some of a user's Sleeper leagues show up.** Search the user id for
`Sleeper: some leagues did not produce a team` and read `skipped`:

- `no roster owned by this Sleeper user`: the user is a co-owner or was
  removed. Matching is on `owner_id` only, so co-owned rosters are skipped.
- `no matchup for roster N in week W`: bye week, playoffs or offseason.
- `unexpected API response`: Sleeper rate-limited or errored for that league.
- A league missing from both `skipped` and the results was never listed by
  Sleeper for this season (compare `leaguesListed` with what they expect).

**Yahoo connects but finds no teams.** Search the user id for
`Yahoo: no teams in API response`. `gamesCount: 0` means Yahoo knows of no
NFL games for this user this season, typically a league that hasn't renewed
for the new season. A missing `fantasy_content` in `responseKeys` means
Yahoo changed its response shape. If instead you see
`Yahoo token refresh error`, the login is stale and the user should reconnect.

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
