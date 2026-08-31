'use server';

/**
 * Gets the current NFL week from the Sleeper API.
 * @returns The current NFL week.
 */
export async function getCurrentNflWeek() {
  const nflStateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
  const nflState = await nflStateResponse.json();
  return nflState.week;
}
