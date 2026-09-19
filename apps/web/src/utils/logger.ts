import pino from 'pino';

/**
 * The logger instance for the application.
 *
 * @remarks
 * Emits one JSON object per line. Vercel Runtime Logs derives severity from
 * the stream a line is written to, so `warn` and above go to stderr (shown
 * as Warning/Error and filterable as such) and everything else to stdout.
 * Errors passed as `{ err }` are serialized with their message and stack.
 *
 * The log level is set based on the `LOG_LEVEL` environment variable,
 * with a default of 'info'.
 *
 * For anything tied to a user, log with `logger.child({ userId, ... })` so
 * a support report can be answered by searching the logs for that user id.
 */
const level = process.env.LOG_LEVEL || 'info';

const logger = pino(
  {
    level,
    serializers: { err: pino.stdSerializers.err },
    base: {
      env: process.env.VERCEL_ENV,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    },
  },
  pino.multistream(
    [
      { level: 'trace', stream: process.stdout },
      { level: 'warn', stream: process.stderr },
    ],
    { dedupe: true }
  )
);

export default logger;
