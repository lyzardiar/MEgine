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
import { BridgeError } from './protocol';

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

/** Start listening for bridge requests. Returns an unlisten function. */
export async function attachBridgeTransport(): Promise<UnlistenFn> {
  return listen<BridgeRequestEvent>('agent-bridge:request', async (event) => {
    const { clientId, message } = event.payload;
    const response = await handleRequest(message);
    try {
      await invoke('agent_bridge_respond', {
        clientId,
        payload: JSON.stringify(response),
      });
    } catch (error) {
      console.error('AgentBridge failed to deliver response', error);
    }
  });
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
      const result = await agentBridge.execute(command, args, {
        screenshot: Boolean(params.screenshot),
      });
      return { jsonrpc: '2.0', id, result };
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
