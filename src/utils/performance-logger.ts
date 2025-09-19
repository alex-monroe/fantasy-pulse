import { performance } from 'node:perf_hooks';

/**
 * Starts a timer that can be passed to {@link logDuration}.
 * @returns A high-resolution timestamp captured via {@link performance.now}.
 */
export function startTimer(): number {
  return performance.now();
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

  console.log(`[performance] ${label}`, payload);
}
