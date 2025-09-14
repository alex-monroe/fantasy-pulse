import { useEffect, useState } from 'react';

/**
 * Polls the backend for a player's live score.
 * @param playerId - Identifier for the player.
 * @param initialScore - Starting score before live updates arrive.
 * @param fetchScore - Optional fetcher to retrieve a player's score. Defaults to calling `/api/players/${playerId}/score`.
 * @returns The latest known score for the player.
 */
export function useLivePlayerScore(
  playerId: string,
  initialScore: number,
  fetchScore?: (id: string) => Promise<number>
): number {
  const [score, setScore] = useState(initialScore);

  // Keep score in sync if the caller provides a new initialScore
  useEffect(() => {
    setScore(initialScore);
  }, [initialScore]);

  useEffect(() => {
    let active = true;

    async function updateScore() {
      try {
        const newScore = fetchScore
          ? await fetchScore(playerId)
          : await fetch(`/api/players/${playerId}/score`).then((res) => res.json()).then((data) => data.score);
        if (active && typeof newScore === 'number') {
          setScore(newScore);
        }
      } catch {
        // Swallow errors to keep UI responsive
      }
    }

    const interval = setInterval(updateScore, 10000);
    updateScore();

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [playerId, fetchScore]);

  return score;
}

export default useLivePlayerScore;
