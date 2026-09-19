import type { Instrumentation } from 'next';

/**
 * Logs every error Next.js catches from a server render, route handler,
 * server action or middleware. Without this, a thrown error only reaches
 * Vercel as an unstructured stack trace.
 *
 * `digest` is the id Next.js attaches to the error the user sees, so it
 * doubles as a search key: `src/app/error.tsx` shows it to the user, and
 * pasting it into Vercel Runtime Logs finds the matching entry here.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { default: logger } = await import('@/utils/logger');
  logger.error(
    {
      err,
      digest: (err as { digest?: string }).digest,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    'Unhandled server error'
  );
};
