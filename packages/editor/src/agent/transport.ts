/**
 * Tauri-event transport adapter for the AgentBridge.
 *
 * The Rust WebSocket server forwards each client frame to the webview as an
 * `agent-bridge:request` event. This adapter parses the JSON-RPC request,
 * dispatches it to the transport-agnostic `agentBridge`, and replies through
 * the `agent_bridge_respond` command, which Rust routes back to the client.
 *
 * Only the main editor window attaches this (detached panels skip it), so each
 * request receives exactly one response.
 *
 * Phase 1 serves read-only `query` calls; `execute` (write commands) returns a
 * READONLY error until Phase 2.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { agentBridge } from './AgentBridge';
import {
  createExecuteFingerprint,
  IdempotencyCapacityError,
  IdempotencyConflictError,
  IdempotentRequestCache,
} from './idempotency';
import { BridgeError } from './protocol';
import type { CommandResult } from './commands';
import { SerialTaskQueue } from './serialQueue';

interface BridgeRequestEvent {
  clientId: string;
  message: string;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse = Record<string, unknown>;

interface BridgeTransportReadyResult {
  accepted: boolean;
  queuedRequests: BridgeRequestEvent[];
}

export const MAX_PENDING_EXECUTE_REQUESTS = 64;
const EXECUTE_CAPACITY_RETRY_AFTER_MS = 250;

const executeRequests = new IdempotentRequestCache<CommandResult>(
  256,
  (result) => {
    if (!result.screenshot) return result;
    const { screenshot: _screenshot, ...compact } = result;
    return compact;
  },
  MAX_PENDING_EXECUTE_REQUESTS,
);
const executeQueue = new SerialTaskQueue();

async function respondToRequest({ clientId, message }: BridgeRequestEvent): Promise<void> {
  const response = await handleRequest(message);
  try {
    await invoke('agent_bridge_respond', {
      clientId,
      payload: JSON.stringify(response),
    });
  } catch (error) {
    console.error('AgentBridge failed to deliver response', error);
  }
}

/** Start listening for bridge requests. Returns an unlisten function. */
export async function attachBridgeTransport(): Promise<UnlistenFn> {
  const sessionId = globalThis.crypto.randomUUID();
  const unlisten = await listen<BridgeRequestEvent>('agent-bridge:request', (event) => {
    void respondToRequest(event.payload);
  });
  try {
    const activation = await invoke<BridgeTransportReadyResult>(
      'agent_bridge_set_transport_ready',
      { sessionId, ready: true },
    );
    await Promise.all(activation.queuedRequests.map(respondToRequest));
  } catch (error) {
    unlisten();
    throw error;
  }
  return () => {
    unlisten();
    void invoke('agent_bridge_set_transport_ready', { sessionId, ready: false })
      .catch((error) => console.error('AgentBridge failed to release transport session', error));
  };
}

async function handleRequest(message: string): Promise<JsonRpcResponse> {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(message);
  } catch {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: 'INVALID_ARGS', message: 'Malformed JSON request' },
    };
  }

  const id = request.id ?? null;
  const method = request.method;
  const params = request.params ?? {};
  const args = (params.args as Record<string, unknown>) ?? {};

  try {
    if (method === 'query') {
      const queryId = params.query;
      if (typeof queryId !== 'string' || !queryId) {
        throw new BridgeError('INVALID_ARGS', 'query requires params.query');
      }
      const data = await agentBridge.query(queryId, args);
      return { jsonrpc: '2.0', id, result: { ok: true, data } };
    }
    if (method === 'execute') {
      const command = params.command;
      if (typeof command !== 'string' || !command) {
        throw new BridgeError('INVALID_ARGS', 'execute requires params.command');
      }
      const requestId = requireRequestId(params.requestId);
      const options = {
        screenshot: Boolean(params.screenshot),
        expectedSceneRevision: params.expectedSceneRevision as number | undefined,
      };
      const fingerprint = createExecuteFingerprint(command, args, options);
      let outcome;
      try {
        outcome = await executeRequests.run(
          requestId,
          fingerprint,
          () => executeQueue.run(
            () => agentBridge.execute(command, args, options),
          ),
        );
      } catch (error) {
        if (error instanceof IdempotencyConflictError) {
          throw new BridgeError('CONFLICT', error.message, { requestId });
        }
        if (error instanceof IdempotencyCapacityError) {
          throw new BridgeError(
            'RATE_LIMITED',
            'Too many unique AgentBridge write requests are already pending',
            {
              pendingWrites: error.pendingEntries,
              maxPendingWrites: error.maxPendingEntries,
              retryAfterMs: EXECUTE_CAPACITY_RETRY_AFTER_MS,
            },
          );
        }
        throw error;
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          ...outcome.value,
          idempotency: {
            requestId,
            replayed: outcome.replayed,
            screenshotOmitted: outcome.fromCompleted
              && Boolean(params.screenshot)
              && outcome.value.screenshot == null,
          },
        },
      };
    }
    return {
      jsonrpc: '2.0',
      id,
      error: { code: 'INVALID_ARGS', message: `Unknown method "${String(method)}"` },
    };
  } catch (error) {
    if (error instanceof BridgeError) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: error.code, message: error.message, data: error.data },
      };
    }
    return { jsonrpc: '2.0', id, error: { code: 'INTERNAL', message: String(error) } };
  }
}

function requireRequestId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 128
    || value.trim() !== value
    || [...value].some((character) => /\p{Cc}/u.test(character))
  ) {
    throw new BridgeError(
      'INVALID_ARGS',
      'execute requires a 1 to 128 character params.requestId without surrounding whitespace or control characters',
    );
  }
  return value;
}
