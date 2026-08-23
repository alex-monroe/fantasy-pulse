import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppNavigation } from '@/components/app-navigation';
import { MCP_TOOLS } from '@/lib/mcp/tools';
import { resolveOrigin } from '@/lib/mcp/server-url';
import { createClient } from '@/utils/supabase/server';

import { listMcpTokens } from './actions';
import { TokenManager } from './components';

export const dynamic = 'force-dynamic';

/**
 * Resolves the absolute URL of the MCP endpoint for the running
 * deployment, so the copy-paste snippets are correct in local dev,
 * preview and production alike.
 */
async function resolveServerUrl(): Promise<string> {
  const origin = await resolveOrigin();
  return origin ? `${origin}/api/mcp` : '/api/mcp';
}

/**
 * The MCP server page: mint and revoke access tokens, and see what the
 * server exposes.
 */
export default async function McpPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const result = await listMcpTokens();
  const tokens = 'tokens' in result ? result.tokens : [];
  const error = 'error' in result ? result.error : null;

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6 md:p-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">MCP Server</h1>
            <p className="text-muted-foreground">
              Give an AI assistant read-only access to your leagues, rosters and
              live matchups. See{' '}
              <Link
                href="https://modelcontextprotocol.io"
                className="underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                modelcontextprotocol.io
              </Link>{' '}
              for compatible clients.
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <TokenManager tokens={tokens} serverUrl={await resolveServerUrl()} />

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Available tools</h2>
            <ul className="space-y-2">
              {MCP_TOOLS.map((tool) => (
                <li key={tool.name} className="rounded-md border p-3">
                  <p className="font-mono text-sm font-medium">{tool.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tool.description}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
