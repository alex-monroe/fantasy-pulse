'use client';

import { useState, useTransition } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

import { createMcpToken, revokeMcpToken, type McpTokenRecord } from './actions';

function formatDate(value: string | null): string {
  if (!value) {
    return 'never';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString();
}

/**
 * Token creation form plus the list of active tokens.
 *
 * @param tokens - The user's existing tokens.
 * @param serverUrl - Absolute URL of the MCP endpoint, for the snippet.
 * @returns The token management panel.
 */
export function TokenManager({
  tokens,
  serverUrl,
}: {
  tokens: McpTokenRecord[];
  serverUrl: string;
}) {
  const [name, setName] = useState('');
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied to clipboard.` });
    } catch {
      toast({
        title: `Could not copy ${label.toLowerCase()}.`,
        description: 'Select the text and copy it manually.',
        variant: 'destructive',
      });
    }
  };

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createMcpToken(name);

      if ('error' in result) {
        toast({
          title: 'Could not create token.',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      setFreshToken(result.token);
      setName('');
    });
  };

  const handleRevoke = (token: McpTokenRecord) => {
    startTransition(async () => {
      const result = await revokeMcpToken(token.id);

      if ('error' in result) {
        toast({
          title: 'Could not revoke token.',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({ title: `Revoked "${token.name}".` });
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create an access token</CardTitle>
          <CardDescription>
            Your MCP client authenticates with this token. It is shown once —
            store it somewhere safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="token-name">Token name</Label>
              <Input
                id="token-name"
                placeholder="Claude Desktop (laptop)"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isPending}
              />
            </div>
            <Button onClick={handleCreate} disabled={isPending}>
              <KeyRound className="mr-2 h-4 w-4" />
              Create token
            </Button>
          </div>

          {freshToken && (
            <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm font-medium">
                Copy your token now — you won&apos;t be able to see it again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">
                  {freshToken}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(freshToken, 'Token')}
                  aria-label="Copy token"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active tokens</CardTitle>
          <CardDescription>
            Revoking a token immediately cuts off any client using it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tokens yet. Create one above to connect a client.
            </p>
          ) : (
            <ul className="divide-y">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{token.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code className="font-mono">{token.token_prefix}…</code>
                      {' · created '}
                      {formatDate(token.created_at)}
                      {' · last used '}
                      {formatDate(token.last_used_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(token)}
                    disabled={isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect a client</CardTitle>
          <CardDescription>
            Point any MCP client at the endpoint below, replacing
            <code className="mx-1 font-mono">YOUR_TOKEN</code>with the token you
            created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Claude Code</Label>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded bg-muted p-3 font-mono text-xs">
                {`claude mcp add --transport http roster-loom ${serverUrl} \\\n  --header "Authorization: Bearer YOUR_TOKEN"`}
              </pre>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy Claude Code command"
                onClick={() =>
                  copy(
                    `claude mcp add --transport http roster-loom ${serverUrl} --header "Authorization: Bearer YOUR_TOKEN"`,
                    'Command',
                  )
                }
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>claude_desktop_config.json</Label>
            <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs">
              {JSON.stringify(
                {
                  mcpServers: {
                    'roster-loom': {
                      type: 'http',
                      url: serverUrl,
                      headers: { Authorization: 'Bearer YOUR_TOKEN' },
                    },
                  },
                },
                null,
                2,
              )}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
