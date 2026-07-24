import type { Team } from '@roster-loom/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { DEMO_MODE, fetchTeams } from '@/lib/api';
import { useSession } from '@/lib/session';

type TeamsState = {
  /** The loaded teams, or `null` before the first successful load. */
  teams: Team[] | null;
  /** The most recent load/refresh error, if any. */
  error: string | null;
  /** Whether a manual refresh is currently in flight. */
  refreshing: boolean;
  /** Re-fetches the teams from the API. */
  refresh: () => Promise<void>;
};

const TeamsContext = createContext<TeamsState>({
  teams: null,
  error: null,
  refreshing: false,
  refresh: async () => {},
});

/**
 * Loads the signed-in user's teams once and shares them across every tab,
 * so the Overview and Report screens stay in sync and don't double-fetch.
 * Re-loads whenever the session changes (sign in / sign out).
 */
export function TeamsProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchTeams();
    if ('error' in result) {
      setError(result.error);
    } else {
      setTeams(result.teams);
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setTeams(null);
      setError(null);
      return;
    }
    void load();
  }, [session, load]);

  // In demo mode the backend serves self-updating fake scores; poll every
  // 30s so the Overview and Report screens visibly refresh like a live
  // Sunday. No-op (and no interval) outside demo mode.
  useEffect(() => {
    if (!DEMO_MODE || !session) {
      return;
    }
    const intervalId = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [session, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <TeamsContext.Provider value={{ teams, error, refreshing, refresh }}>
      {children}
    </TeamsContext.Provider>
  );
}

export function useTeams() {
  return useContext(TeamsContext);
}
