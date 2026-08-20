/**
 * A minimal, stateless implementation of MCP's Streamable HTTP transport.
 *
 * The server is tools-only and holds no session state, so a request is
 * fully described by its JSON-RPC body: every POST is answered with a
 * single JSON response and nothing is retained between calls. That is
 * exactly the shape serverless hosting wants, and it keeps the protocol
 * surface small enough to own directly rather than pulling in an adapter
 * that pins its own SDK version.
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */
import { findTool, listToolDescriptors, type McpToolContext } from './tools';

/** Protocol revisions this server understands, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];

/** The revision used when a client doesn't ask for a specific one. */
export const DEFAULT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const SERVER_INFO = {
  name: 'roster-loom',
  title: 'Roster Loom',
  version: '1.0.0',
};

const INSTRUCTIONS = [
  'Roster Loom aggregates one user’s fantasy football teams across Sleeper,',
  'Yahoo and Ottoneu into a single live view. All data is scoped to the',
  'account that issued the access token, and reflects the current NFL week.',
  'Call `list_leagues` first — the `leagueKey` values it returns address',
  'every other league-specific tool.',
].join(' ');

/** JSON-RPC error codes used by this server. */
export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function success(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function failure(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

/**
 * Picks the protocol revision to answer an `initialize` with: the
 * client's request when supported, otherwise this server's newest.
 *
 * @param requested - The `protocolVersion` the client asked for.
 * @returns The revision to report back.
 */
export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === 'string' &&
    SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : DEFAULT_PROTOCOL_VERSION;
}

/**
 * Handles one JSON-RPC message.
 *
 * @param message - The parsed request or notification.
 * @param loadContext - Lazily resolves the user's teams. Only invoked
 *   for `tools/call`, so handshake traffic never triggers a fan-out to
 *   the fantasy providers.
 * @returns The response, or `null` for notifications (which get no reply).
 */
async function handleMessage(
  message: JsonRpcRequest,
  loadContext: () => Promise<McpToolContext>,
): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;
  const isNotification = message.id === undefined || message.id === null;
  const method = typeof message.method === 'string' ? message.method : null;

  if (!method) {
    return isNotification
      ? null
      : failure(id, JSON_RPC_ERRORS.invalidRequest, 'Request is missing a method.');
  }

  // Notifications never get a reply, whatever they are.
  if (isNotification) {
    return null;
  }

  const params =
    message.params && typeof message.params === 'object'
      ? (message.params as Record<string, unknown>)
      : {};

  switch (method) {
    case 'initialize':
      return success(id, {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });

    case 'ping':
      return success(id, {});

    case 'tools/list':
      return success(id, { tools: listToolDescriptors() });

    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : null;
      if (!name) {
        return failure(
          id,
          JSON_RPC_ERRORS.invalidParams,
          'tools/call requires a `name` parameter.',
        );
      }

      const tool = findTool(name);
      if (!tool) {
        return failure(id, JSON_RPC_ERRORS.invalidParams, `Unknown tool: ${name}`);
      }

      const args =
        params.arguments && typeof params.arguments === 'object'
          ? (params.arguments as Record<string, unknown>)
          : {};

      try {
        const context = await loadContext();
        return success(id, tool.handler(args, context));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`MCP tool ${name} failed`, error);

        // Surfaced as a tool error rather than a protocol error: the
        // call was well-formed, the data behind it just wasn't there.
        return success(id, {
          content: [{ type: 'text', text: `Failed to load fantasy data: ${detail}` }],
          isError: true,
        });
      }
    }

    default:
      return failure(id, JSON_RPC_ERRORS.methodNotFound, `Unknown method: ${method}`);
  }
}

/** What the transport should send back for a parsed payload. */
export type McpDispatchResult = {
  /** HTTP status to respond with. */
  status: number;
  /** Response body, or `null` when there is nothing to send (202). */
  body: JsonRpcResponse | JsonRpcResponse[] | null;
};

/**
 * Dispatches a decoded request body, handling both single messages and
 * the batch arrays permitted by pre-2025-06-18 revisions.
 *
 * @param payload - The parsed JSON body of the POST.
 * @param loadContext - Lazily resolves the user's teams.
 * @returns The status and body to respond with.
 */
export async function dispatchMcpPayload(
  payload: unknown,
  loadContext: () => Promise<McpToolContext>,
): Promise<McpDispatchResult> {
  // Memoized here rather than by the caller so the "one provider
  // fan-out per request" guarantee holds however the loader is written,
  // including for batches where several tools run off one payload.
  let pending: Promise<McpToolContext> | null = null;
  const loadOnce = () => {
    pending ??= loadContext();
    return pending;
  };

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return {
        status: 400,
        body: failure(null, JSON_RPC_ERRORS.invalidRequest, 'Batch must not be empty.'),
      };
    }

    const responses = await Promise.all(
      payload.map((message) => handleMessage(message ?? {}, loadOnce)),
    );
    const populated = responses.filter(
      (response): response is JsonRpcResponse => response !== null,
    );

    // An all-notification batch is acknowledged with no content.
    return populated.length === 0
      ? { status: 202, body: null }
      : { status: 200, body: populated };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      status: 400,
      body: failure(
        null,
        JSON_RPC_ERRORS.invalidRequest,
        'Request body must be a JSON-RPC object or array.',
      ),
    };
  }

  const response = await handleMessage(payload as JsonRpcRequest, loadOnce);

  return response === null
    ? { status: 202, body: null }
    : { status: 200, body: response };
}
