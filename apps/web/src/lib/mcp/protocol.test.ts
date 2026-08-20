import type { Team } from '@roster-loom/core';

import {
  DEFAULT_PROTOCOL_VERSION,
  dispatchMcpPayload,
  JSON_RPC_ERRORS,
  negotiateProtocolVersion,
} from './protocol';
import type { McpToolContext } from './tools';

const team: Team = {
  id: 1,
  name: 'My Team',
  league: {
    provider: 'sleeper',
    providerLeagueId: '99',
    name: 'Test League',
    season: '2026',
    totalRosters: 10,
  },
  totalScore: 100,
  players: [
    {
      id: 'p1',
      name: 'Star Player',
      position: 'WR',
      realTeam: 'SF',
      score: 22.4,
      gameStatus: 'final',
      gameStartTime: null,
      gameQuarter: 'Final',
      gameClock: null,
      onUserTeams: 0,
      onOpponentTeams: 0,
      gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
      imageUrl: '',
      onBench: false,
    },
  ],
  opponent: { name: 'Their Team', totalScore: 88, players: [] },
};

function contextLoader(overrides: Partial<McpToolContext> = {}) {
  const load = jest.fn(async (): Promise<McpToolContext> => ({
    teams: [team],
    week: 5,
    demo: false,
    ...overrides,
  }));

  return load;
}

async function call(payload: unknown, load = contextLoader()) {
  return dispatchMcpPayload(payload, load);
}

describe('negotiateProtocolVersion', () => {
  it('echoes a supported version', () => {
    expect(negotiateProtocolVersion('2024-11-05')).toBe('2024-11-05');
  });

  it('falls back to the newest for anything else', () => {
    expect(negotiateProtocolVersion('1999-01-01')).toBe(DEFAULT_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(undefined)).toBe(DEFAULT_PROTOCOL_VERSION);
  });
});

describe('initialize', () => {
  it('advertises tool support and identifies the server', async () => {
    const { status, body } = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    });

    expect(status).toBe(200);
    const result = (body as any).result;
    expect(result.protocolVersion).toBe('2025-03-26');
    expect(result.capabilities.tools).toBeDefined();
    expect(result.serverInfo.name).toBe('roster-loom');
    expect(result.instructions).toContain('list_leagues');
  });

  it('does not fetch fantasy data during the handshake', async () => {
    const load = contextLoader();

    await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, load);
    await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, load);

    expect(load).not.toHaveBeenCalled();
  });
});

describe('notifications', () => {
  it('are acknowledged with 202 and no body', async () => {
    const { status, body } = await call({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(status).toBe(202);
    expect(body).toBeNull();
  });
});

describe('tools/list', () => {
  it('returns every tool with an input schema', async () => {
    const { body } = await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = (body as any).result.tools;

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((tool: any) => tool.name)).toContain('list_leagues');
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.description).toBe('string');
    }
  });
});

describe('tools/call', () => {
  it('runs a tool and returns text plus structured content', async () => {
    const { body } = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_leagues', arguments: {} },
    });

    const result = (body as any).result;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.leagueCount).toBe(1);
    expect(result.structuredContent.leagues[0].leagueKey).toBe('sleeper:99');
    expect(JSON.parse(result.content[0].text).week).toBe(5);
  });

  it('loads fantasy data at most once per request', async () => {
    const load = contextLoader();

    await call(
      [
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_leagues' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_rooting_guide' } },
      ],
      load,
    );

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reports an unknown tool as invalid params', async () => {
    const { body } = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'nope' },
    });

    expect((body as any).error.code).toBe(JSON_RPC_ERRORS.invalidParams);
  });

  it('returns a tool error, not a protocol error, for a bad league key', async () => {
    const { body } = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_league_matchup', arguments: { leagueKey: 'missing' } },
    });

    const result = (body as any).result;
    expect(result.isError).toBe(true);
    // The model should be told what it could have used instead.
    expect(result.content[0].text).toContain('sleeper:99');
  });

  it('surfaces a data-loading failure as a tool error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failing = jest.fn(async () => {
      throw new Error('Supabase exploded');
    });

    const { status, body } = await call(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_leagues' } },
      failing,
    );

    expect(status).toBe(200);
    expect((body as any).result.isError).toBe(true);
    expect((body as any).result.content[0].text).toContain('Supabase exploded');

    errorSpy.mockRestore();
  });
});

describe('malformed input', () => {
  it('rejects a non-object body', async () => {
    const { status, body } = await call('nope');

    expect(status).toBe(400);
    expect((body as any).error.code).toBe(JSON_RPC_ERRORS.invalidRequest);
  });

  it('rejects an empty batch', async () => {
    const { status } = await call([]);
    expect(status).toBe(400);
  });

  it('reports unknown methods', async () => {
    const { body } = await call({ jsonrpc: '2.0', id: 1, method: 'resources/list' });
    expect((body as any).error.code).toBe(JSON_RPC_ERRORS.methodNotFound);
  });

  it('answers ping', async () => {
    const { body } = await call({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect((body as any).result).toEqual({});
  });
});
