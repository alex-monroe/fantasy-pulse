/**
 * The tools the Roster Loom MCP server exposes.
 *
 * Each tool is a pure function of the already-fetched `Team[]` plus its
 * arguments, so the route handler does exactly one provider fan-out per
 * request no matter which tool was called.
 */
import type { Team } from '@roster-loom/core';
import {
  aggregatePlayerExposure,
  buildRootingGuide,
  describeMatchup,
  findTeamByLeagueKey,
  searchPlayerExposure,
  summarizeLeagues,
  type McpPlayerExposure,
} from './views';

/** Everything a tool needs about the current request. */
export type McpToolContext = {
  /** The user's teams across every connected provider. */
  teams: Team[];
  /** The NFL week the scores belong to. */
  week: number | null;
  /** Whether the data is demo data rather than live provider data. */
  demo: boolean;
};

/** What a tool hands back to the transport layer. */
export type McpToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
};

type JsonSchema = {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/** A tool's public description plus its implementation. */
export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (
    args: Record<string, unknown>,
    context: McpToolContext,
  ) => McpToolResult;
};

const EMPTY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

/**
 * Wraps a payload in the dual representation MCP clients expect: JSON
 * text for models that read the transcript, and `structuredContent` for
 * clients that consume tool output programmatically.
 *
 * @param payload - The tool's result data.
 * @returns The MCP tool result.
 */
function ok(payload: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

/**
 * Builds a tool-level error. These are reported through `isError` rather
 * than a JSON-RPC error so the model can see and recover from them.
 *
 * @param message - What went wrong, phrased for the model.
 * @returns The MCP tool result.
 */
function fail(message: string): McpToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function readString(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function describeContext(context: McpToolContext) {
  return {
    week: context.week,
    ...(context.demo ? { demoMode: true } : {}),
  };
}

function filterExposures(
  exposures: McpPlayerExposure[],
  args: Record<string, unknown>,
): McpPlayerExposure[] {
  const position = readString(args, 'position');
  const onlyStarters = args.onlyStarters === true;
  const onlyMultiLeague = args.onlyMultiLeague === true;

  return exposures.filter((exposure) => {
    if (position && exposure.position.toUpperCase() !== position.toUpperCase()) {
      return false;
    }

    if (onlyStarters && !exposure.rosteredIn.some((entry) => entry.starting)) {
      return false;
    }

    if (onlyMultiLeague && exposure.onYourTeams < 2) {
      return false;
    }

    return true;
  });
}

/** Every tool the server advertises, in the order clients see them. */
export const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_leagues',
    title: 'List leagues',
    description:
      "Lists every fantasy football league the user has a team in, across all connected platforms (Sleeper, Yahoo, Ottoneu), with this week's score, the opponent's score, the margin, and how many starters have yet to kick off. Start here: other tools take the `leagueKey` values this returns.",
    inputSchema: EMPTY_SCHEMA,
    handler: (_args, context) => {
      const leagues = summarizeLeagues(context.teams);

      return ok({
        ...describeContext(context),
        leagueCount: leagues.length,
        leadingCount: leagues.filter((league) => league.margin > 0).length,
        trailingCount: leagues.filter((league) => league.margin < 0).length,
        leagues,
      });
    },
  },
  {
    name: 'get_league_matchup',
    title: 'Get a league matchup',
    description:
      "Returns one league's full head-to-head matchup: both teams' starting lineups and benches, every player's fantasy points, their NFL team, and their live game state (kickoff time, quarter and clock, or final). Use this for detailed roster and scoring questions about a specific league.",
    inputSchema: {
      type: 'object',
      properties: {
        leagueKey: {
          type: 'string',
          description:
            'The `leagueKey` from `list_leagues`. The league or team name also works.',
        },
      },
      required: ['leagueKey'],
      additionalProperties: false,
    },
    handler: (args, context) => {
      const leagueKey = readString(args, 'leagueKey');
      if (!leagueKey) {
        return fail('`leagueKey` is required. Call `list_leagues` first to get one.');
      }

      const match = findTeamByLeagueKey(context.teams, leagueKey);
      if (!match) {
        const available = summarizeLeagues(context.teams)
          .map((league) => `${league.leagueKey} (${league.leagueName})`)
          .join(', ');

        return fail(
          available
            ? `No league matched "${leagueKey}". Available leagues: ${available}.`
            : `No league matched "${leagueKey}". This account has no connected leagues.`,
        );
      }

      return ok({
        ...describeContext(context),
        ...describeMatchup(match.team, match.leagueKey),
      });
    },
  },
  {
    name: 'list_rostered_players',
    title: 'List players across all leagues',
    description:
      "Aggregates every player across all of the user's leagues at once, deduplicated by player. For each one it reports the leagues where the user rosters them (and whether they're starting), the leagues where the opponent rosters them, and their current points. Use this for cross-league questions like exposure, double-ups, or who is starting where.",
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          description: 'Restrict to a single position, e.g. `QB`, `RB`, `WR`, `TE`.',
        },
        onlyStarters: {
          type: 'boolean',
          description: 'Only include players starting in at least one of the user’s leagues.',
        },
        onlyMultiLeague: {
          type: 'boolean',
          description: 'Only include players the user rosters in two or more leagues.',
        },
      },
      additionalProperties: false,
    },
    handler: (args, context) => {
      const all = aggregatePlayerExposure(context.teams);
      const players = filterExposures(all, args).filter(
        (exposure) => exposure.onYourTeams > 0,
      );

      return ok({
        ...describeContext(context),
        playerCount: players.length,
        players,
      });
    },
  },
  {
    name: 'find_player',
    title: 'Find a player',
    description:
      "Searches every roster in every league — the user's teams and their opponents' — for a player by name or NFL team abbreviation. Returns where the player shows up, whether they're starting, their points, and their live game state. Use this to answer 'do I have X anywhere' or 'who is starting against me'.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Part of a player name (e.g. `mahomes`) or an NFL team abbreviation (e.g. `KC`).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: (args, context) => {
      const query = readString(args, 'query');
      if (!query) {
        return fail('`query` is required — pass part of a player name or an NFL team abbreviation.');
      }

      const matches = searchPlayerExposure(aggregatePlayerExposure(context.teams), query);

      return ok({
        ...describeContext(context),
        query,
        matchCount: matches.length,
        players: matches,
      });
    },
  },
  {
    name: 'get_rooting_guide',
    title: 'Get the cross-league rooting guide',
    description:
      "Classifies players across the user's whole slate into who to root for (on multiple of the user's teams, no opponent's), who to root against (on multiple opponent teams), and who they're conflicted about (on both sides). Use this for 'who should I be cheering for this week' questions.",
    inputSchema: EMPTY_SCHEMA,
    handler: (_args, context) =>
      ok({
        ...describeContext(context),
        ...buildRootingGuide(context.teams),
      }),
  },
];

/**
 * Looks a tool up by name.
 *
 * @param name - The tool name from a `tools/call` request.
 * @returns The tool, or `undefined` when unknown.
 */
export function findTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

/**
 * The tool list in the shape `tools/list` returns.
 *
 * @returns Tool descriptors without their handlers.
 */
export function listToolDescriptors() {
  return MCP_TOOLS.map(({ name, title, description, inputSchema }) => ({
    name,
    title,
    description,
    inputSchema,
  }));
}
