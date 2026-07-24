import { groupMatchupPlayers, processMatchups, mockTeams } from '@roster-loom/core';

// Proves the shared matchup logic the Overview and Report screens depend on
// resolves and runs from inside the mobile package. If the @roster-loom/core
// wiring or these exports regress, both screens break.
describe('shared matchup logic (mobile)', () => {
  it('groups players across teams for the Overview screen', () => {
    const { myPlayers, opponentPlayers } = groupMatchupPlayers(mockTeams);
    expect(myPlayers.length).toBeGreaterThan(0);
    // Mahomes is on both user teams -> aggregated once with a count of 2.
    const mahomes = myPlayers.find((p) => p.name === 'Patrick Mahomes');
    expect(mahomes?.count).toBe(2);
    expect(Array.isArray(opponentPlayers)).toBe(true);
  });

  it('classifies players for the Report screen', () => {
    const { fantasyHeroes, doubleAgents } = processMatchups(mockTeams);
    expect(fantasyHeroes.some((p) => p.name === 'Patrick Mahomes')).toBe(true);
    expect(doubleAgents.some((p) => p.name === 'C. McCaffrey')).toBe(true);
  });
});
