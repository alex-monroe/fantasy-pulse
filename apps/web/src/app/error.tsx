'use client';

import { Button } from '@/components/ui/button';

/**
 * Fallback shown when a page throws while rendering. Displays the error
 * digest so a user can quote it in a bug report; the same digest is logged
 * server-side by `src/instrumentation.ts`.
 * @returns A short error message with a retry button.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        We hit an error loading this page. If it keeps happening, send the
        reference below to support.
      </p>
      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 text-xs">
          Reference: {error.digest}
        </code>
      )}
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
