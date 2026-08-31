import { performance } from 'node:perf_hooks';

/**
 * Whether timing output should be written.
 *
 * Silent under Jest by default: a full run emits hundreds of `[performance]`
 * lines, which buries the one failure you are looking for. Set `PERF_LOG=1`
 * to get them back while debugging a specific test.
 */
function shouldLog(): boolean {
  if (process.env.PERF_LOG === '1') return true;
  return process.env.NODE_ENV !== 'test';
}

/**
 * Starts a timer that can be passed to {@link logDuration}.
 * @returns A high-resolution timestamp captured via {@link performance.now}.
 */
export function startTimer(): number {
  return performance.now();
}

/**
 * Logs a one-off marker on the performance channel, for points in a request
 * that are worth seeing in order but have no duration of their own.
 *
 * @param label - The human readable label describing the event.
 */
export function logEvent(label: string) {
  if (!shouldLog()) return;
  console.log(`[performance] ${label}`);
}

/**
 * Logs how long an operation took alongside optional metadata. Undefined
 * metadata values are stripped before logging to keep the output concise.
 *
 * @param label - The human readable label describing the operation.
 * @param start - The timestamp captured from {@link startTimer}.
 * @param metadata - Additional contextual details to include with the log.
 */
export function logDuration(
  label: string,
  start: number,
  metadata?: Record<string, unknown>
) {
  const durationMs = Number((performance.now() - start).toFixed(2));
  const payload: Record<string, unknown> = { durationMs };

  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined) {
        payload[key] = value;
      }
    }
  }

  if (!shouldLog()) return;
  console.log(`[performance] ${label}`, payload);
}
