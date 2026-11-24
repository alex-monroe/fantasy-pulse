'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import {
  INFERENCE_TRUST_MATCH_RATE,
  INFERENCE_TRUST_MIN_SAMPLE,
  describeReceptionScoring,
  groupScoringForDisplay,
  isScoringTrusted,
  type FantasyProvider,
  type LeagueScoring,
} from '@roster-loom/core';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const PROVIDER_NAMES: Record<FantasyProvider, string> = {
  sleeper: 'Sleeper',
  yahoo: 'Yahoo',
  espn: 'ESPN',
  ottoneu: 'Ottoneu',
  demo: 'Demo',
};

export const providerName = (provider: FantasyProvider) => PROVIDER_NAMES[provider] ?? provider;

export const leagueHref = (provider: string, leagueId: string) =>
  `/leagues/${provider}/${encodeURIComponent(leagueId)}`;

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** A short badge for where a league's scoring came from. */
export function ScoringSourceBadge({ scoring, provider }: { scoring: LeagueScoring; provider: FantasyProvider }) {
  if (scoring.source === 'provider') {
    return <Badge variant="secondary">Read from {providerName(provider)}</Badge>;
  }
  if (scoring.source === 'inferred') {
    const trusted = isScoringTrusted(scoring);
    return (
      <Badge
        variant="outline"
        className={cn(trusted ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400')}
      >
        Inferred · {percent(scoring.inference?.matchRate ?? 0)} match
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      No scoring known
    </Badge>
  );
}

/** One line on what the league's scoring is, for the list view. */
export function scoringSummary(scoring: LeagueScoring): string {
  if (Object.keys(scoring.settings).length === 0) return 'Using stock half-PPR until settings are known';
  const s = scoring.settings;
  const parts = [describeReceptionScoring(s), `${s.pass_td ?? 0}-pt passing TDs`];
  if (s.bonus_rec_te) parts.push(`+${s.bonus_rec_te} TE premium`);
  return parts.join(' · ');
}

/** Why the scoring is what it is, in a sentence or two. */
function ScoringExplanation({ scoring, provider }: { scoring: LeagueScoring; provider: FantasyProvider }) {
  const name = providerName(provider);
  if (scoring.source === 'provider') {
    return <>These are the league&apos;s own settings, read from {name}.</>;
  }
  if (scoring.source === 'inferred') {
    const fit = scoring.inference;
    const trusted = isScoringTrusted(scoring);
    return (
      <>
        We couldn&apos;t read these settings from {name}
        {scoring.readError ? ` (${scoring.readError})` : ''}, so we inferred them from{' '}
        {fit?.sampleSize ?? 0} player-weeks
        {fit?.throughWeek ? ` through week ${fit.throughWeek}` : ''}. They reproduce{' '}
        {percent(fit?.matchRate ?? 0)} of {name}&apos;s official scores exactly.{' '}
        {trusted
          ? 'That is close enough to score live plays and projections with them.'
          : `Below ${percent(INFERENCE_TRUST_MATCH_RATE)} (or under ${INFERENCE_TRUST_MIN_SAMPLE} player-weeks), live plays and projections keep a stock half-PPR profile.`}
      </>
    );
  }
  return (
    <>
      We don&apos;t know this league&apos;s scoring yet
      {scoring.readError ? ` (${scoring.readError})` : ''}. Once games have been played we&apos;ll infer it from
      the league&apos;s past scores. Until then, live plays and projections use a stock half-PPR profile.
    </>
  );
}

function CheckAgainButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? 'Checking…' : 'Check again'}
    </Button>
  );
}

const formatValue = (value: number) => {
  const rounded = Math.round(value * 10000) / 10000;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
};

/** A league's full scoring table, with where it came from and what we couldn't translate. */
export function LeagueScoringDetail({
  provider,
  leagueId,
  scoring,
  recheck,
}: {
  provider: FantasyProvider;
  leagueId: string;
  scoring: LeagueScoring;
  recheck?: (formData: FormData) => Promise<void>;
}) {
  const groups = groupScoringForDisplay(scoring.settings);
  const assumed = scoring.source === 'inferred' ? scoring.inference?.assumed ?? [] : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">Scoring</CardTitle>
              <ScoringSourceBadge scoring={scoring} provider={provider} />
            </div>
            <CardDescription>
              <ScoringExplanation scoring={scoring} provider={provider} />
            </CardDescription>
            {scoring.checkedAt && (
              <p className="text-xs text-muted-foreground">
                Last checked {new Date(scoring.checkedAt).toLocaleString()}
              </p>
            )}
          </div>
          {recheck && (
            <form action={recheck}>
              <input type="hidden" name="provider" value={provider} />
              <input type="hidden" name="leagueId" value={leagueId} />
              <CheckAgainButton />
            </form>
          )}
        </CardHeader>
        {groups.length > 0 && (
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map(({ group, rows }) => (
                <div key={group}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
                  <dl className="space-y-1 text-sm">
                    {rows.map((row) => (
                      <div key={row.key} className="flex items-baseline justify-between gap-3" data-testid="scoring-row">
                        <dt>{row.label}</dt>
                        <dd className="font-medium tabular-nums">{formatValue(row.value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {scoring.unmapped.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rules we can&apos;t apply yet</CardTitle>
            <CardDescription>
              The league scores these, but they have no equivalent in the stats we score live plays with. The
              official score includes them; our live and projected numbers don&apos;t.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1 text-sm">
              {scoring.unmapped.map((rule) => (
                <div key={rule.label} className="flex items-baseline justify-between gap-3">
                  <dt>{rule.label}</dt>
                  <dd className="font-medium tabular-nums">{formatValue(rule.value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {assumed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not yet tested by any game, so left at {providerName(provider)}&apos;s default: {assumed.join(', ')}.
        </p>
      )}
    </div>
  );
}

/** The list of the user's leagues. */
export function LeagueList({
  leagues,
}: {
  leagues: { provider: FantasyProvider; leagueId: string; name: string; teamName: string; scoring: LeagueScoring }[];
}) {
  if (leagues.length === 0) {
    return (
      <p className="text-muted-foreground">
        No leagues yet. <Link href="/integrations" className="underline">Connect a provider</Link> to import yours.
      </p>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {leagues.map((league) => (
        <Link
          key={`${league.provider}:${league.leagueId}`}
          href={leagueHref(league.provider, league.leagueId)}
          className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
          data-testid="league-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{league.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {providerName(league.provider)} · {league.teamName}
              </p>
            </div>
            <ScoringSourceBadge scoring={league.scoring} provider={league.provider} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{scoringSummary(league.scoring)}</p>
        </Link>
      ))}
    </div>
  );
}
