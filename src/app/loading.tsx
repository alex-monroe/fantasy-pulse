import { Loader2 } from 'lucide-react';
import { AppNavigation } from '@/components/app-navigation';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading treatment shown while the home page is generated on the server.
 * @returns A centered loading indicator.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation
        endContent={(
          <div className="flex items-center gap-2">
            <Skeleton className="hidden h-9 w-20 sm:inline" aria-hidden="true" />
            <Skeleton className="h-9 w-24" aria-hidden="true" />
          </div>
        )}
      />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading your dashboard&hellip;</p>
          <span className="sr-only">Loading dashboard content</span>
        </div>
      </main>
    </div>
  );
}
