#!/usr/bin/env node
/**
 * Local HTTP adapter for MEngine AgentBridge.
 *
 * This is a transport-only process: query and execute semantics remain owned
 * by the editor AgentBridge. The adapter binds IPv4 loopback exclusively and
 * requires a random bearer token for every endpoint.
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  bridgeExecute,
  bridgeQuery,
  closeBridgeConnection,
  structuredError,
} from '../mcp/server.mjs';

const HTTP_SCHEMA_VERSION = 1;
const MAX_HTTP_BODY_BYTES = 8 * 1024 * 1024;
const MAX_HTTP_RESPONSE_BYTES = 128 * 1024 * 1024;
const MAX_ACTIVE_HTTP_REQUESTS = 64;
const MAX_HTTP_CONNECTIONS = 128;

const HELP = `MEngine Agent HTTP adapter

Usage:
  mengine-agent-http [--port <0-65535>] [--discovery-file <path>]

Environment:
  MENGINE_AGENT_HTTP_PORT          Default listen port (0 chooses a free port)
  MENGINE_AGENT_HTTP_TOKEN         Optional bearer token (16-256 characters)
  MENGINE_AGENT_HTTP_FILE          Override HTTP discovery-file path
  MENGINE_AGENT_BRIDGE_FILE        Override editor Bridge discovery-file path
  MENGINE_AGENT_APPROVAL_TOKEN     Forward an editor dangerous-operation approval

Endpoints:
  GET  /v1/health
  POST /v1/query
  POST /v1/execute

The adapter always binds 127.0.0.1. It writes and prints a discovery record
containing its port, bearer token, and process id.
`;

class AgentHttpError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.name = 'AgentHttpError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function requiredOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new AgentHttpError(400, 'INVALID_ARGS', `${option} requires a value`);
  }
  return value;
}

function parsePort(value, source) {
  if (!/^(0|[1-9]\d*)$/u.test(value)) {
    throw new AgentHttpError(
      400,
      'INVALID_ARGS',
      `${source} must be an integer from 0 to 65535`,
    );
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new AgentHttpError(
      400,
      'INVALID_ARGS',
      `${source} must be an integer from 0 to 65535`,
    );
  }
  return port;
}

export function parseHttpServerArguments(argv, env = process.env) {
  let port = parsePort(env.MENGINE_AGENT_HTTP_PORT ?? '0', 'MENGINE_AGENT_HTTP_PORT');
  let discoveryFile = env.MENGINE_AGENT_HTTP_FILE
    ? path.resolve(env.MENGINE_AGENT_HTTP_FILE)
    : null;
  let portSeen = false;
  let discoverySeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '-h' || option === '--help') return { help: true };
    if (option === '--port') {
      if (portSeen) {
        throw new AgentHttpError(400, 'INVALID_ARGS', '--port may be provided only once');
      }
      port = parsePort(requiredOptionValue(argv, index, option), '--port');
      portSeen = true;
      index += 1;
      continue;
    }
    if (option === '--discovery-file') {
      if (discoverySeen) {
        throw new AgentHttpError(
          400,
          'INVALID_ARGS',
          '--discovery-file may be provided only once',
        );
      }
      discoveryFile = path.resolve(requiredOptionValue(argv, index, option));
      discoverySeen = true;
      index += 1;
      continue;
    }
    throw new AgentHttpError(400, 'INVALID_ARGS', `Unknown option "${option}"`);
  }

  return {
    help: false,
    port,
    discoveryFile: discoveryFile ?? defaultHttpDiscoveryPath(env),
  };
}

function configBasePath(env = process.env) {
  if (process.platform === 'win32') {
    return env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

export function defaultHttpDiscoveryPath(env = process.env) {
  return path.join(configBasePath(env), 'com.mengine.editor', 'agent-http.json');
}

function configuredHttpToken(env = process.env) {
  const configured = env.MENGINE_AGENT_HTTP_TOKEN;
  if (configured === undefined) return randomBytes(32).toString('base64url');
  if (
    configured.length < 16
    || configured.length > 256
    || !/^[\x21-\x7E]+$/u.test(configured)
  ) {
    throw new AgentHttpError(
      400,
      'INVALID_ARGS',
      'MENGINE_AGENT_HTTP_TOKEN must contain 16-256 visible ASCII characters',
    );
  }
  return configured;
}

export function writeHttpDiscoveryFile(file, record) {
  const destination = path.resolve(file);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.renameSync(temporary, destination);
    try {
      fs.chmodSync(destination, 0o600);
    } catch {
      // Windows ACLs, rather than POSIX mode bits, remain authoritative.
    }
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // The atomic rename normally consumes the temporary file.
    }
  }
}

export function removeOwnedHttpDiscoveryFile(file, owner) {
  const destination = path.resolve(file);
  let current;
  try {
    current = JSON.parse(fs.readFileSync(destination, 'utf8'));
  } catch {
    return false;
  }
  if (current.pid !== owner.pid || current.token !== owner.token) return false;
  try {
    fs.unlinkSync(destination);
    return true;
  } catch {
    return false;
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new AgentHttpError(400, 'INVALID_ARGS', `${label}.${key} is not allowed`);
    }
  }
}

function requiredBridgeId(value, field) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 128
    || !/^[A-Za-z0-9_.-]+$/u.test(value)
  ) {
    throw new AgentHttpError(
      400,
      'INVALID_ARGS',
      `${field} must be a 1-128 character Bridge id`,
    );
  }
  return value;
}

function optionalArgs(value) {
  if (value === undefined) return {};
  if (!plainObject(value)) {
    throw new AgentHttpError(400, 'INVALID_ARGS', 'args must be a JSON object');
  }
  return value;
}

export function validateHttpQueryBody(value) {
  if (!plainObject(value)) {
    throw new AgentHttpError(400, 'INVALID_ARGS', 'Request body must be a JSON object');
  }
  assertExactKeys(value, new Set(['query', 'args']), 'body');
  return {
    query: requiredBridgeId(value.query, 'query'),
    args: optionalArgs(value.args),
  };
}

export function validateHttpExecuteBody(value) {
  if (!plainObject(value)) {
    throw new AgentHttpError(400, 'INVALID_ARGS', 'Request body must be a JSON object');
  }
  assertExactKeys(value, new Set(['command', 'args', 'requestId', 'options']), 'body');
  const requestId = value.requestId;
  if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 128) {
    throw new AgentHttpError(
      400,
      'INVALID_ARGS',
      'requestId must contain between 1 and 128 characters',
    );
  }
  const options = value.options ?? {};
  if (!plainObject(options)) {
    throw new AgentHttpError(400, 'INVALID_ARGS', 'options must be a JSON object');
  }
  assertExactKeys(
    options,
    new Set(['screenshot', 'expectedSceneRevision']),
    'options',
  );
  if (options.screenshot !== undefined && typeof options.screenshot !== 'boolean') {
    throw new AgentHttpError(400, 'INVALID_ARGS', 'options.screenshot must be a boolean');
  }
  if (
    options.expectedSceneRevision !== undefined
    && (
      !Number.isSafeInteger(options.expectedSceneRevision)
      || options.expectedSceneRevision < 0
    )
  ) {
    throw new AgentHttpError(
      400,
      'INVALID_ARGS',
      'options.expectedSceneRevision must be a non-negative safe integer',
    );
  }
  return {
    command: requiredBridgeId(value.command, 'command'),
    args: optionalArgs(value.args),
    requestId,
    options: {
      screenshot: Boolean(options.screenshot),
      expectedSceneRevision: options.expectedSceneRevision,
    },
  };
}

function allowedHostHeader(value, port) {
  if (typeof value !== 'string') return false;
  const host = value.toLocaleLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function tokenMatches(authorization, token) {
  if (
    typeof authorization !== 'string'
    || authorization.slice(0, 7).toLocaleLowerCase() !== 'bearer '
  ) {
    return false;
  }
  const supplied = Buffer.from(authorization.slice(7), 'utf8');
  const expected = Buffer.from(token, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readJsonBody(request, maxBodyBytes) {
  const contentType = String(request.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLocaleLowerCase();
  if (contentType !== 'application/json') {
    throw new AgentHttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new AgentHttpError(
      413,
      'REQUEST_TOO_LARGE',
      `Request body exceeds the ${maxBodyBytes} byte limit`,
    );
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) {
      throw new AgentHttpError(
        413,
        'REQUEST_TOO_LARGE',
        `Request body exceeds the ${maxBodyBytes} byte limit`,
      );
    }
    chunks.push(buffer);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks, total).toString('utf8').replace(/^\uFEFF/u, ''));
  } catch (error) {
    throw new AgentHttpError(
      400,
      'INVALID_JSON',
      `Request body is not valid JSON: ${error.message}`,
    );
  }
  return value;
}

function bridgeErrorStatus(error) {
  switch (error?.code) {
    case 'INVALID_ARGS':
      return 400;
    case 'PERMISSION_DENIED':
      return 403;
    case 'ENTITY_NOT_FOUND':
    case 'COMPONENT_NOT_FOUND':
      return 404;
    case 'STALE_REVISION':
    case 'CONFLICT':
    case 'READONLY':
      return 409;
    case 'RATE_LIMITED':
      return 429;
    case 'BRIDGE_CONNECTION':
    case 'NOT_READY':
    case 'PROJECT_NOT_OPEN':
      return 503;
    case 'UNKNOWN_OUTCOME':
      return 502;
    default:
      return 500;
  }
}

function jsonResponse(response, status, value, maxResponseBytes) {
  const body = JSON.stringify(value);
  const length = Buffer.byteLength(body);
  if (length > maxResponseBytes) {
    const fallback = JSON.stringify({
      ok: false,
      error: {
        code: 'RESPONSE_TOO_LARGE',
        message: `Response exceeds the ${maxResponseBytes} byte limit`,
      },
    });
    response.writeHead(507, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(fallback),
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(fallback);
    return;
  }
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': length,
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function methodNotAllowed(pathname) {
  const allow = pathname === '/v1/health' ? 'GET' : 'POST';
  const error = new AgentHttpError(405, 'METHOD_NOT_ALLOWED', `Use ${allow} ${pathname}`);
  error.allow = allow;
  return error;
}

export function createAgentHttpServer({
  token,
  query = bridgeQuery,
  execute = bridgeExecute,
  maxBodyBytes = MAX_HTTP_BODY_BYTES,
  maxResponseBytes = MAX_HTTP_RESPONSE_BYTES,
  maxActiveRequests = MAX_ACTIVE_HTTP_REQUESTS,
} = {}) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 256) {
    throw new Error('HTTP bearer token must contain between 16 and 256 characters');
  }
  let listenPort = null;
  let activeRequests = 0;

  const server = http.createServer(async (request, response) => {
    response.on('error', () => {
      // Client disconnects are translated to request cancellation below.
    });
    let allowHeader;
    try {
      if (!allowedHostHeader(request.headers.host, listenPort)) {
        throw new AgentHttpError(403, 'INVALID_HOST', 'Host must address this loopback listener');
      }
      if (!tokenMatches(request.headers.authorization, token)) {
        throw new AgentHttpError(401, 'UNAUTHORIZED', 'A valid bearer token is required');
      }
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${listenPort}`);
      if (url.search) {
        throw new AgentHttpError(400, 'INVALID_ARGS', 'Query strings are not supported');
      }
      if (!['/v1/health', '/v1/query', '/v1/execute'].includes(url.pathname)) {
        throw new AgentHttpError(404, 'NOT_FOUND', `Unknown endpoint: ${url.pathname}`);
      }
      if (url.pathname === '/v1/health') {
        if (request.method !== 'GET') throw methodNotAllowed(url.pathname);
        jsonResponse(response, 200, {
          ok: true,
          service: 'mengine-agent-http',
          schemaVersion: HTTP_SCHEMA_VERSION,
          pid: process.pid,
        }, maxResponseBytes);
        return;
      }
      if (request.method !== 'POST') throw methodNotAllowed(url.pathname);
      const body = await readJsonBody(request, maxBodyBytes);
      if (activeRequests >= maxActiveRequests) {
        throw new AgentHttpError(
          429,
          'RATE_LIMITED',
          'Too many HTTP requests are already active',
          {
            activeRequests,
            maxActiveRequests,
            retryAfterMs: 250,
          },
        );
      }

      const controller = new AbortController();
      const cancel = () => controller.abort();
      request.once('aborted', cancel);
      response.once('close', () => {
        if (!response.writableEnded) cancel();
      });
      activeRequests += 1;
      try {
        if (url.pathname === '/v1/query') {
          const input = validateHttpQueryBody(body);
          const data = await query(input.query, input.args, {
            signal: controller.signal,
          });
          if (controller.signal.aborted || response.destroyed) return;
          jsonResponse(response, 200, {
            ok: true,
            operation: 'query',
            id: input.query,
            data,
          }, maxResponseBytes);
          return;
        }

        const input = validateHttpExecuteBody(body);
        const result = await execute(input.command, input.args, {
          ...input.options,
          requestId: input.requestId,
          signal: controller.signal,
        });
        if (controller.signal.aborted || response.destroyed) return;
        jsonResponse(response, 200, {
          ok: true,
          operation: 'execute',
          id: input.command,
          requestId: input.requestId,
          result,
        }, maxResponseBytes);
      } finally {
        activeRequests -= 1;
        request.removeListener('aborted', cancel);
      }
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (error instanceof AgentHttpError) {
        allowHeader = error.allow;
        if (allowHeader) response.setHeader('Allow', allowHeader);
        jsonResponse(response, error.status, {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.data === undefined ? {} : { data: error.data }),
          },
        }, maxResponseBytes);
        return;
      }
      const payload = structuredError(error);
      jsonResponse(response, bridgeErrorStatus(payload), {
        ok: false,
        error: payload,
      }, maxResponseBytes);
    }
  });

  server.maxConnections = MAX_HTTP_CONNECTIONS;
  server.maxHeadersCount = 64;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.on('listening', () => {
    const address = server.address();
    listenPort = typeof address === 'object' && address ? address.port : null;
  });
  server.on('clientError', (_error, socket) => {
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    }
  });
  return server;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('HTTP adapter did not receive a TCP listen address'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: '127.0.0.1', port, exclusive: true });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server.closeIdleConnections?.();
  });
}

export async function runHttpServer(argv, env = process.env) {
  const options = parseHttpServerArguments(argv, env);
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const token = configuredHttpToken(env);
  const server = createAgentHttpServer({ token });
  let serverFailure = null;
  const onServerError = (error) => {
    serverFailure ??= error;
    if (server.listening) void closeServer(server);
  };
  server.on('error', onServerError);
  const port = await listen(server, options.port);
  const discovery = {
    schemaVersion: HTTP_SCHEMA_VERSION,
    host: '127.0.0.1',
    port,
    token,
    pid: process.pid,
    startedAt: Date.now(),
  };
  try {
    writeHttpDiscoveryFile(options.discoveryFile, discovery);
  } catch (error) {
    await closeServer(server);
    throw error;
  }
  process.stdout.write(`${JSON.stringify({
    ...discovery,
    discoveryFile: options.discoveryFile,
  })}\n`);
  process.stderr.write(`[mengine-agent-http] listening on 127.0.0.1:${port}\n`);

  let shutdownStarted = false;
  let forceCloseTimer = null;
  const shutdown = () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    void closeServer(server);
    forceCloseTimer = setTimeout(() => server.closeAllConnections?.(), 5_000);
    forceCloseTimer.unref?.();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try {
    await new Promise((resolve) => server.once('close', resolve));
  } finally {
    if (forceCloseTimer !== null) clearTimeout(forceCloseTimer);
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
    server.removeListener('error', onServerError);
    removeOwnedHttpDiscoveryFile(options.discoveryFile, discovery);
    closeBridgeConnection();
  }
  if (serverFailure) throw serverFailure;
  return 0;
}

const launchedAsMain =
  process.argv[1] != null
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (launchedAsMain) {
  runHttpServer(process.argv.slice(2)).then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      const payload = error instanceof AgentHttpError
        ? { code: error.code, message: error.message }
        : structuredError(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: payload })}\n`);
      process.exitCode = 1;
    },
  );
}
