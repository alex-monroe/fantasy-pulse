'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { Team } from '@/lib/types';

type MatchupPriorityContextType = {
  prioritizedTeams: Team[];
  setPrioritizedTeams: (teams: Team[]) => void;
};

const MatchupPriorityContext = createContext<MatchupPriorityContextType | undefined>(undefined);

export function MatchupPriorityProvider({ children, initialTeams }: { children: ReactNode, initialTeams: Team[] }) {
  const [prioritizedTeams, setPrioritizedTeams] = useState<Team[]>(initialTeams);

  return (
    <MatchupPriorityContext.Provider value={{ prioritizedTeams, setPrioritizedTeams }}>
      {children}
    </MatchupPriorityContext.Provider>
  );
}

export function useMatchupPriority() {
  const context = useContext(MatchupPriorityContext);
  if (context === undefined) {
    throw new Error('useMatchupPriority must be used within a MatchupPriorityProvider');
  }
  return context;
}
