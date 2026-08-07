#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  agentDoctor,
  bridgeExecute,
  bridgeQuery,
  closeBridgeConnection,
  structuredError,
} from '../mcp/server.mjs';
import {
  importFigmaUi as importFigmaUiBridge,
  previewFigmaUi as previewFigmaUiBridge,
} from '../figma/bridge.mjs';

const MAX_ARGS_BYTES = 8 * 1024 * 1024;

const HELP = `MEngine Agent CLI

Usage:
  mengine-agent query <query-id> [options]
  mengine-agent execute <command-id> [options]
  mengine-agent figma-preview <figma-url> [options]
  mengine-agent figma-import <figma-url> [options]
  mengine-agent doctor [options]

Options:
  --args <json|@file|->           Argument object; @file reads UTF-8 JSON, - reads stdin
  --discovery-file <path>         Override the AgentBridge discovery file
  --editor-mode <mode>            auto-background, required-background, or discovery-only
  --editor <path>                 Exact background editor executable
  --request-id <id>               Execute idempotency key (auto-generated when omitted)
  --expected-scene-revision <n>   Reject the write if the live scene revision differs
  --screenshot                    Capture a post-command viewport screenshot
  --compact                       Emit compact JSON instead of pretty JSON
  -h, --help                      Show this help

Environment:
  MENGINE_EDITOR_CONFIG_DIR       Discover background/foreground records in this directory
  MENGINE_AGENT_BRIDGE_FILE       Override discovery with one exact record
  FIGMA_ACCESS_TOKEN              Figma token with file_content:read; never sent to the editor

Examples:
  mengine-agent query window.list
  mengine-agent query window.ui_snapshot --args "{\\"windowLabel\\":\\"main\\"}"
  mengine-agent execute intent.apply --args @intent.json --expected-scene-revision 12
  mengine-agent figma-preview "https://www.figma.com/design/KEY/Name?node-id=1-2"
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
  if (!['query', 'execute', 'doctor', 'figma-preview', 'figma-import'].includes(operation)) {
    throw new CliUsageError('First argument must be "query", "execute", "figma-preview", "figma-import", or "doctor"');
  }
  const figmaOperation = operation === 'figma-preview' || operation === 'figma-import';
  const id = operation === 'doctor' || figmaOperation ? null : argv[1];
  const figmaUrl = figmaOperation ? argv[1] : null;
  const target = figmaOperation ? figmaUrl : id;
  if (operation !== 'doctor' && (!target || target.startsWith('-'))) {
    throw new CliUsageError(`${operation} requires ${figmaOperation ? 'a Figma URL' : 'an exact Bridge id'}`);
  }

  const options = {
    help: false,
    operation,
    id,
    ...(figmaOperation ? { figmaUrl } : {}),
    argsSource: null,
    discoveryFile: null,
    editorMode: null,
    editorExecutable: null,
    requestId: null,
    expectedSceneRevision: undefined,
    screenshot: false,
    compact: false,
  };
  for (let index = operation === 'doctor' ? 1 : 2; index < argv.length; index += 1) {
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
    if (option === '--editor-mode') {
      const mode = requiredValue(argv, index, option);
      if (!['auto-background', 'required-background', 'discovery-only'].includes(mode)) {
        throw new CliUsageError(`${option} must be auto-background, required-background, or discovery-only`);
      }
      options.editorMode = mode;
      index += 1;
      continue;
    }
    if (option === '--editor') {
      options.editorExecutable = requiredValue(argv, index, option);
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

  if (operation === 'query' || operation === 'figma-preview') {
    if (options.requestId !== null) {
      throw new CliUsageError(operation === 'query'
        ? '--request-id is valid only for execute'
        : '--request-id is valid only for figma-import');
    }
    if (options.expectedSceneRevision !== undefined) {
      throw new CliUsageError(operation === 'query'
        ? '--expected-scene-revision is valid only for execute'
        : '--expected-scene-revision is valid only for figma-import');
    }
    if (options.screenshot) {
      throw new CliUsageError(operation === 'query'
        ? '--screenshot is valid only for execute'
        : '--screenshot is valid only for figma-import');
    }
  }
  if (operation === 'doctor' && (
    options.argsSource !== null
    || options.requestId !== null
    || options.expectedSceneRevision !== undefined
    || options.screenshot
  )) {
    throw new CliUsageError('doctor accepts only connection, editor, and output options');
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
  // Windows PowerShell 5 emits a UTF-8 BOM when piping text to a native
  // process. Treat that encoding marker as transport metadata, not JSON.
  contents = contents.replace(/^\uFEFF/, '');
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
    if (options.editorMode) process.env.MENGINE_AGENT_EDITOR_MODE = options.editorMode;
    if (options.editorExecutable) {
      process.env.MENGINE_EDITOR_EXECUTABLE = path.resolve(options.editorExecutable);
    }
    if (options.operation === 'doctor') {
      const data = await agentDoctor();
      writeJson(process.stdout, data, options.compact);
      return data.ok ? 0 : 1;
    }
    const args = await parseArgsObject(options.argsSource);
    if (options.operation === 'figma-preview') {
      const data = await previewFigmaUiBridge({ ...args, url: options.figmaUrl }, {
        query: bridgeQuery,
      });
      writeJson(process.stdout, {
        ok: true,
        operation: 'figma-preview',
        data,
      }, options.compact);
      return 0;
    }
    if (options.operation === 'figma-import') {
      const data = await importFigmaUiBridge({
        ...args,
        url: options.figmaUrl,
        ...(options.requestId === null ? {} : { requestId: options.requestId }),
        ...(options.expectedSceneRevision === undefined
          ? {}
          : { expectedSceneRevision: options.expectedSceneRevision }),
        ...(options.screenshot ? { screenshot: true } : {}),
      }, {
        query: bridgeQuery,
        execute: bridgeExecute,
      });
      writeJson(process.stdout, {
        ok: true,
        operation: 'figma-import',
        data,
      }, options.compact);
      return 0;
    }
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
