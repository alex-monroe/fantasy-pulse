import { redirect } from 'next/navigation';

import { AppNavigation } from '@/components/app-navigation';
import { Button } from '@/components/ui/button';
import { getOAuthClient } from '@/lib/mcp/oauth';
import { createClient } from '@/utils/supabase/server';

import { decideAuthorization } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function param(searchParams: SearchParams, key: string): string {
  const value = searchParams[key];
  return typeof value === 'string' ? value : '';
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex flex-1 items-center justify-center p-4">
        <p className="max-w-sm rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {message}
        </p>
      </main>
    </div>
  );
}

/**
 * The consent screen a DCR client redirects a user to. Validates the
 * request against the registered client before rendering anything —
 * only once redirect_uri is confirmed to belong to client_id is it safe
 * to send the browser back there, whether the user approves or denies.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  const responseType = param(searchParams, 'response_type');
  const clientId = param(searchParams, 'client_id');
  const redirectUri = param(searchParams, 'redirect_uri');
  const codeChallenge = param(searchParams, 'code_challenge');
  const codeChallengeMethod = param(searchParams, 'code_challenge_method');
  const state = param(searchParams, 'state');

  if (responseType !== 'code' || !clientId || !redirectUri || !codeChallenge) {
    return (
      <ErrorPage message="Malformed authorization request: response_type, client_id, redirect_uri and code_challenge are all required." />
    );
  }

  if (codeChallengeMethod !== 'S256') {
    return <ErrorPage message="This server only supports PKCE with code_challenge_method=S256." />;
  }

  const client = await getOAuthClient(createClient(), clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return <ErrorPage message="Unknown client, or redirect_uri does not match its registration." />;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === 'string') query.set(key, value);
    }
    redirect(`/login?next=${encodeURIComponent(`/mcp/authorize?${query.toString()}`)}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 rounded-md border p-6">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Authorize {client.clientName}</h1>
            <p className="text-sm text-muted-foreground">
              This app wants read-only access to your Roster Loom leagues, rosters and
              live matchups, signed in as <span className="font-medium">{user.email}</span>.
            </p>
          </div>
          <form action={decideAuthorization} className="flex gap-3">
            <input type="hidden" name="client_id" value={clientId} />
            <input type="hidden" name="redirect_uri" value={redirectUri} />
            <input type="hidden" name="code_challenge" value={codeChallenge} />
            <input type="hidden" name="state" value={state} />
            <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
              Deny
            </Button>
            <Button type="submit" name="decision" value="approve" className="flex-1">
              Approve
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
