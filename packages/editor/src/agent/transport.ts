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
 * Read-only `query` calls dispatch directly. Revision-guarded `execute` calls
 * require an idempotency key, join duplicate in-flight work, and run through
 * one bounded FIFO queue so concurrent clients cannot overlap editor writes.
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

interface BridgeCancelEvent {
  clientId: string;
  requestId: string | number;
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
const MAX_CANCELLED_REQUEST_TOMBSTONES = 256;

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
const activeRequestControllers = new Map<string, AbortController>();
const cancelledRequestKeys = new Set<string>();

async function respondToRequest({ clientId, message }: BridgeRequestEvent): Promise<void> {
  const requestKey = bridgeRequestKey(clientId, message);
  const controller = new AbortController();
  if (requestKey) {
    activeRequestControllers.set(requestKey, controller);
    if (cancelledRequestKeys.delete(requestKey)) controller.abort();
  }
  const response = await handleRequest(message, controller.signal);
  if (requestKey && activeRequestControllers.get(requestKey) === controller) {
    activeRequestControllers.delete(requestKey);
  }
  if (controller.signal.aborted) return;
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
  const unlistenRequests = await listen<BridgeRequestEvent>('agent-bridge:request', (event) => {
    void respondToRequest(event.payload);
  });
  let unlistenCancellation: UnlistenFn;
  try {
    unlistenCancellation = await listen<BridgeCancelEvent>('agent-bridge:cancel', (event) => {
      const requestKey = bridgeRequestIdKey(
        event.payload.clientId,
        event.payload.requestId,
      );
      const controller = activeRequestControllers.get(requestKey);
      if (controller) {
        controller.abort();
      } else {
        rememberCancelledRequest(requestKey);
      }
    });
  } catch (error) {
    unlistenRequests();
    throw error;
  }
  try {
    const activation = await invoke<BridgeTransportReadyResult>(
      'agent_bridge_set_transport_ready',
      { sessionId, ready: true },
    );
    await Promise.all(activation.queuedRequests.map(respondToRequest));
  } catch (error) {
    unlistenCancellation();
    unlistenRequests();
    throw error;
  }
  return () => {
    unlistenCancellation();
    unlistenRequests();
    for (const controller of activeRequestControllers.values()) {
      controller.abort();
    }
    activeRequestControllers.clear();
    cancelledRequestKeys.clear();
    void invoke('agent_bridge_set_transport_ready', { sessionId, ready: false })
      .catch((error) => console.error('AgentBridge failed to release transport session', error));
  };
}

async function handleRequest(
  message: string,
  signal: AbortSignal,
): Promise<JsonRpcResponse> {
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
      if (signal.aborted) throw requestCancelledError();
      const queryId = params.query;
      if (typeof queryId !== 'string' || !queryId) {
        throw new BridgeError('INVALID_ARGS', 'query requires params.query');
      }
      const data = await agentBridge.query(queryId, args, { signal });
      return { jsonrpc: '2.0', id, result: { ok: true, data } };
    }
    if (method === 'execute') {
      if (signal.aborted) throw requestCancelledError();
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
            () => {
              if (signal.aborted) throw requestCancelledError();
              return agentBridge.execute(command, args, options);
            },
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

function bridgeRequestKey(clientId: string, message: string): string | null {
  try {
    const request = JSON.parse(message) as JsonRpcRequest;
    const id = request.id;
    if (
      typeof id !== 'string'
      && (typeof id !== 'number' || !Number.isSafeInteger(id))
    ) {
      return null;
    }
    return bridgeRequestIdKey(clientId, id);
  } catch {
    return null;
  }
}

function bridgeRequestIdKey(clientId: string, requestId: string | number): string {
  return `${clientId}\u0000${typeof requestId}:${String(requestId)}`;
}

function rememberCancelledRequest(requestKey: string): void {
  if (
    !cancelledRequestKeys.has(requestKey)
    && cancelledRequestKeys.size >= MAX_CANCELLED_REQUEST_TOMBSTONES
  ) {
    const oldest = cancelledRequestKeys.values().next().value;
    if (typeof oldest === 'string') cancelledRequestKeys.delete(oldest);
  }
  cancelledRequestKeys.add(requestKey);
}

function requestCancelledError(): Error {
  const error = new Error('AgentBridge request cancelled');
  error.name = 'AbortError';
  return error;
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
