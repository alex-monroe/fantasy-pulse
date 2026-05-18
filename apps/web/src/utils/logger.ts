import pino from 'pino';

/**
 * The logger instance for the application.
 *
 * @remarks
 * The log level is set based on the `LOG_LEVEL` environment variable,
 * with a default of 'info'.
 */
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export default logger;
