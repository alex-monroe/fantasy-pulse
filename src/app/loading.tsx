import { Loader2 } from 'lucide-react';

/**
 * Loading treatment shown while the home page is generated on the server.
 * @returns A centered loading indicator.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading your dashboard&hellip;</p>
        <span className="sr-only">Loading dashboard content</span>
      </div>
    </div>
  );
}
