#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  bridgeExecute,
  bridgeQuery,
  closeBridgeConnection,
  structuredError,
} from '../mcp/server.mjs';

const MAX_ARGS_BYTES = 8 * 1024 * 1024;

const HELP = `MEngine Agent CLI

Usage:
  mengine-agent query <query-id> [options]
  mengine-agent execute <command-id> [options]

Options:
  --args <json|@file|->           Argument object; @file reads UTF-8 JSON, - reads stdin
  --discovery-file <path>         Override the AgentBridge discovery file
  --request-id <id>               Execute idempotency key (auto-generated when omitted)
  --expected-scene-revision <n>   Reject the write if the live scene revision differs
  --screenshot                    Capture a post-command viewport screenshot
  --compact                       Emit compact JSON instead of pretty JSON
  -h, --help                      Show this help

Examples:
  mengine-agent query window.list
  mengine-agent query window.ui_snapshot --args "{\\"windowLabel\\":\\"main\\"}"
  mengine-agent execute intent.apply --args @intent.json --expected-scene-revision 12
`;

class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliUsageError';
  }
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new CliUsageError(`${option} requires a value`);
  }
  return value;
}

function parseNonNegativeInteger(value, option) {
  if (!/^(0|[1-9]\d*)$/u.test(value)) {
    throw new CliUsageError(`${option} must be a non-negative safe integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new CliUsageError(`${option} must be a non-negative safe integer`);
  }
  return parsed;
}

export function parseCliArguments(argv) {
  if (
    argv.length === 0
    || argv[0] === '-h'
    || argv[0] === '--help'
    || argv[0] === 'help'
  ) {
    return { help: true };
  }
  const operation = argv[0];
  if (operation !== 'query' && operation !== 'execute') {
    throw new CliUsageError('First argument must be "query" or "execute"');
  }
  const id = argv[1];
  if (!id || id.startsWith('-')) {
    throw new CliUsageError(`${operation} requires an exact Bridge id`);
  }

  const options = {
    help: false,
    operation,
    id,
    argsSource: null,
    discoveryFile: null,
    requestId: null,
    expectedSceneRevision: undefined,
    screenshot: false,
    compact: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '-h' || option === '--help') {
      return { help: true };
    }
    if (option === '--args') {
      if (options.argsSource !== null) {
        throw new CliUsageError('--args may be provided only once');
      }
      options.argsSource = requiredValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === '--discovery-file') {
      options.discoveryFile = requiredValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === '--request-id') {
      options.requestId = requiredValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === '--expected-scene-revision') {
      options.expectedSceneRevision = parseNonNegativeInteger(
        requiredValue(argv, index, option),
        option,
      );
      index += 1;
      continue;
    }
    if (option === '--screenshot') {
      options.screenshot = true;
      continue;
    }
    if (option === '--compact') {
      options.compact = true;
      continue;
    }
    throw new CliUsageError(`Unknown option "${option}"`);
  }

  if (operation === 'query') {
    if (options.requestId !== null) {
      throw new CliUsageError('--request-id is valid only for execute');
    }
    if (options.expectedSceneRevision !== undefined) {
      throw new CliUsageError('--expected-scene-revision is valid only for execute');
    }
    if (options.screenshot) {
      throw new CliUsageError('--screenshot is valid only for execute');
    }
  }
  if (
    options.requestId !== null
    && (options.requestId.length < 1 || options.requestId.length > 128)
  ) {
    throw new CliUsageError('--request-id must contain between 1 and 128 characters');
  }
  return options;
}

function boundedUtf8(contents, source) {
  if (Buffer.byteLength(contents, 'utf8') > MAX_ARGS_BYTES) {
    throw new CliUsageError(`${source} exceeds the 8 MiB argument limit`);
  }
  return contents;
}

async function readStdin() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_ARGS_BYTES) {
      throw new CliUsageError('stdin exceeds the 8 MiB argument limit');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function parseArgsObject(source) {
  if (source === null) return {};
  let contents;
  let label = '--args';
  if (source === '-') {
    contents = await readStdin();
    label = 'stdin';
  } else if (source.startsWith('@')) {
    const file = path.resolve(source.slice(1));
    if (!source.slice(1)) throw new CliUsageError('@file requires a path');
    let stats;
    try {
      stats = fs.statSync(file);
    } catch (error) {
      throw new CliUsageError(`Cannot read argument file "${file}": ${error.message}`);
    }
    if (!stats.isFile()) throw new CliUsageError(`Argument path is not a file: ${file}`);
    if (stats.size > MAX_ARGS_BYTES) {
      throw new CliUsageError(`Argument file exceeds the 8 MiB limit: ${file}`);
    }
    try {
      contents = boundedUtf8(fs.readFileSync(file, 'utf8'), 'Argument file');
    } catch (error) {
      if (error instanceof CliUsageError) throw error;
      throw new CliUsageError(`Cannot read argument file "${file}": ${error.message}`);
    }
    label = file;
  } else {
    contents = boundedUtf8(source, '--args');
  }
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new CliUsageError(`${label} is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliUsageError(`${label} must contain a JSON object`);
  }
  return parsed;
}

function writeJson(stream, value, compact) {
  stream.write(`${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
}

export async function runCli(argv) {
  let options;
  try {
    options = parseCliArguments(argv);
    if (options.help) {
      process.stdout.write(HELP);
      return 0;
    }
    if (options.discoveryFile) {
      process.env.MENGINE_AGENT_BRIDGE_FILE = path.resolve(options.discoveryFile);
    }
    const args = await parseArgsObject(options.argsSource);
    if (options.operation === 'query') {
      const data = await bridgeQuery(options.id, args);
      writeJson(process.stdout, {
        ok: true,
        operation: 'query',
        id: options.id,
        data,
      }, options.compact);
      return 0;
    }

    const requestId = options.requestId ?? `cli:${randomUUID()}`;
    const result = await bridgeExecute(options.id, args, {
      requestId,
      expectedSceneRevision: options.expectedSceneRevision,
      screenshot: options.screenshot,
    });
    writeJson(process.stdout, {
      ok: true,
      operation: 'execute',
      id: options.id,
      requestId,
      result,
    }, options.compact);
    return 0;
  } catch (error) {
    const payload = error instanceof CliUsageError
      ? { code: 'INVALID_ARGS', message: error.message }
      : structuredError(error);
    writeJson(process.stderr, { ok: false, error: payload }, options?.compact ?? false);
    return error instanceof CliUsageError ? 2 : 1;
  } finally {
    closeBridgeConnection();
  }
}

const launchedAsMain =
  process.argv[1] != null
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (launchedAsMain) {
  runCli(process.argv.slice(2)).then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      writeJson(process.stderr, {
        ok: false,
        error: { code: 'INTERNAL', message: error?.message || String(error) },
      }, false);
      process.exitCode = 1;
    },
  );
}
