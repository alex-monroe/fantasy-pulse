/**
 * End-to-end coverage of the tools over real generated data, so the
 * league metadata the builders attach is exercised rather than mocked.
 */
import { generateDemoTeams } from '@roster-loom/core';

import { dispatchMcpPayload } from './protocol';
import { findTool, listToolDescriptors, MCP_TOOLS, type McpToolContext } from './tools';

const context: McpToolContext = {
  teams: generateDemoTeams(Date.parse('2026-09-13T17:30:00Z')),
  week: 2,
  demo: true,
};

const run = (name: string, args: Record<string, unknown> = {}) => {
  const tool = findTool(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const result = tool.handler(args, context);

  return {
    result,
    payload: result.structuredContent as Record<string, any>,
  };
};

describe('tool definitions', () => {
  it('exposes unique names', () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('documents every tool and marks required arguments', () => {
    for (const tool of listToolDescriptors()) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.title).toBeTruthy();

      for (const required of tool.inputSchema.required ?? []) {
        expect(tool.inputSchema.properties).toHaveProperty(required);
      }
    }
  });
});

describe('list_leagues over demo data', () => {
  it('returns one entry per league with a usable key', () => {
    const { payload } = run('list_leagues');

    expect(payload.leagueCount).toBe(context.teams.length);
    expect(payload.demoMode).toBe(true);
    expect(payload.week).toBe(2);

    for (const league of payload.leagues) {
      expect(league.leagueKey).toMatch(/^demo:/);
      expect(league.leagueName).toBeTruthy();
      // The reported margin must reconcile with the two scores.
      expect(league.margin).toBeCloseTo(league.points - league.opponentPoints, 5);
    }
  });

  it('counts leading and trailing leagues consistently', () => {
    const { payload } = run('list_leagues');

    expect(payload.leadingCount + payload.trailingCount).toBeLessThanOrEqual(
      payload.leagueCount,
    );
  });
});

describe('get_league_matchup over demo data', () => {
  it('returns both full rosters for a key from list_leagues', () => {
    const { payload: leagues } = run('list_leagues');
    const { leagueKey } = leagues.leagues[0];

    const { result, payload } = run('get_league_matchup', { leagueKey });

    expect(result.isError).toBeUndefined();
    expect(payload.leagueKey).toBe(leagueKey);
    expect(payload.you.starters.length).toBeGreaterThan(0);
    expect(payload.you.bench.length).toBeGreaterThan(0);
    expect(payload.opponent.starters.length).toBeGreaterThan(0);
    expect(payload.you.starters.every((p: any) => p.starting)).toBe(true);
    expect(payload.you.bench.every((p: any) => !p.starting)).toBe(true);
  });

  it('errors without a league key', () => {
    expect(run('get_league_matchup', {}).result.isError).toBe(true);
  });
});

describe('list_rostered_players over demo data', () => {
  it('only reports players the user actually rosters', () => {
    const { payload } = run('list_rostered_players');

    expect(payload.playerCount).toBeGreaterThan(0);
    for (const player of payload.players) {
      expect(player.onYourTeams).toBeGreaterThan(0);
      expect(player.rosteredIn.length).toBe(player.onYourTeams);
    }
  });

  it('filters by position', () => {
    const { payload } = run('list_rostered_players', { position: 'qb' });

    expect(payload.players.length).toBeGreaterThan(0);
    expect(payload.players.every((p: any) => p.position === 'QB')).toBe(true);
  });

  it('filters to multi-league players only', () => {
    const { payload } = run('list_rostered_players', { onlyMultiLeague: true });

    expect(payload.players.every((p: any) => p.onYourTeams >= 2)).toBe(true);
  });

  it('filters to players starting somewhere', () => {
    const { payload } = run('list_rostered_players', { onlyStarters: true });

    expect(
      payload.players.every((p: any) => p.rosteredIn.some((r: any) => r.starting)),
    ).toBe(true);
  });
});

describe('find_player over demo data', () => {
  it('finds a known player from the demo pool', () => {
    const { payload: all } = run('list_rostered_players');
    const target = all.players[0].name;

    const { payload } = run('find_player', { query: target.split(' ')[1] ?? target });

    expect(payload.matchCount).toBeGreaterThan(0);
    expect(payload.players.some((p: any) => p.name === target)).toBe(true);
  });

  it('returns an empty match set rather than an error for a miss', () => {
    const { result, payload } = run('find_player', { query: 'zzzznotaplayer' });

    expect(result.isError).toBeUndefined();
    expect(payload.matchCount).toBe(0);
  });

  it('errors on a blank query', () => {
    expect(run('find_player', { query: '  ' }).result.isError).toBe(true);
  });
});

describe('get_rooting_guide over demo data', () => {
  it('classifies players into the three buckets', () => {
    const { payload } = run('get_rooting_guide');

    expect(Array.isArray(payload.rootFor)).toBe(true);
    expect(Array.isArray(payload.rootAgainst)).toBe(true);
    expect(Array.isArray(payload.conflicted)).toBe(true);
    // The demo slate deliberately overlaps rosters.
    expect(payload.rootFor.length + payload.conflicted.length).toBeGreaterThan(0);
  });
});

describe('every tool over the wire', () => {
  it('returns parseable JSON text matching its structured content', async () => {
    for (const tool of MCP_TOOLS) {
      const { body } = await dispatchMcpPayload(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: tool.name,
            arguments:
              tool.name === 'get_league_matchup'
                ? { leagueKey: 'demo:demo-league-1' }
                : tool.name === 'find_player'
                  ? { query: 'a' }
                  : {},
          },
        },
        async () => context,
      );

      const result = (body as any).result;
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    }
  });
});
