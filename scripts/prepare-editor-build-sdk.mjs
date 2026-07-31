import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const sdkDir = join(root, 'packages', 'editor', 'src-tauri', 'build-sdk');
const cliDir = join(root, 'packages', 'cli');
const agentDir = join(root, 'packages', 'agent');
const runtimeName = process.platform === 'win32' ? 'mengine-runtime.exe' : 'mengine-runtime';
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
const platform = process.platform === 'win32'
  ? 'windows'
  : process.platform === 'darwin' ? 'macos' : 'linux';
const skipBuild = process.argv.includes('--skip-build');

function run(file, args) {
  execFileSync(file, args, { cwd: root, stdio: 'inherit', windowsHide: true });
}

function requireFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} was not produced: ${path}`);
  return path;
}

if (!skipBuild) {
  if (process.platform === 'win32') {
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd', '--filter', '@mengine/cli', 'build']);
  } else {
    run('pnpm', ['--filter', '@mengine/cli', 'build']);
  }
  run('cargo', ['build', '-p', 'mengine-runtime']);
  run('cargo', ['build', '-p', 'mengine-runtime', '--release']);
}

const cliEntry = requireFile(join(cliDir, 'dist', 'cli.js'), 'MEngine CLI');
const debugRuntime = requireFile(join(root, 'target', 'debug', runtimeName), 'Debug player runtime');
const releaseRuntime = requireFile(join(root, 'target', 'release', runtimeName), 'Release player runtime');
const requireFromCli = createRequire(join(cliDir, 'package.json'));
const typescriptPackage = requireFromCli.resolve('typescript/package.json');
const typescriptRoot = dirname(typescriptPackage);

rmSync(sdkDir, { recursive: true, force: true });
mkdirSync(join(sdkDir, 'cli'), { recursive: true });
mkdirSync(join(sdkDir, 'agent'), { recursive: true });
mkdirSync(join(sdkDir, 'node_modules'), { recursive: true });
mkdirSync(join(sdkDir, 'runtimes', 'debug'), { recursive: true });
mkdirSync(join(sdkDir, 'runtimes', 'release'), { recursive: true });
mkdirSync(join(sdkDir, 'licenses'), { recursive: true });
writeFileSync(join(sdkDir, '.gitkeep'), '');

copyFileSync(process.execPath, join(sdkDir, nodeName));
cpSync(join(cliDir, 'dist'), join(sdkDir, 'cli', 'dist'), { recursive: true, dereference: true });
copyFileSync(join(cliDir, 'package.json'), join(sdkDir, 'cli', 'package.json'));
for (const adapter of ['mcp', 'cli', 'http']) {
  cpSync(join(agentDir, adapter), join(sdkDir, 'agent', adapter), {
    recursive: true,
    dereference: true,
  });
}
copyFileSync(join(agentDir, 'package.json'), join(sdkDir, 'agent', 'package.json'));
cpSync(typescriptRoot, join(sdkDir, 'node_modules', 'typescript'), { recursive: true, dereference: true });
copyFileSync(debugRuntime, join(sdkDir, 'runtimes', 'debug', runtimeName));
copyFileSync(releaseRuntime, join(sdkDir, 'runtimes', 'release', runtimeName));
copyFileSync(
  join(root, 'packages', 'editor', 'THIRD_PARTY_NOTICES.md'),
  join(sdkDir, 'licenses', 'THIRD_PARTY_NOTICES.md'),
);
if (process.platform !== 'win32') {
  chmodSync(join(sdkDir, nodeName), 0o755);
  chmodSync(join(sdkDir, 'runtimes', 'debug', runtimeName), 0o755);
  chmodSync(join(sdkDir, 'runtimes', 'release', runtimeName), 0o755);
}

const cliPackage = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8'));
const agentPackage = JSON.parse(readFileSync(join(agentDir, 'package.json'), 'utf8'));
const adapterEntries = {
  mcp: 'agent/mcp/server.mjs',
  cli: 'agent/cli/editor.mjs',
  http: 'agent/http/server.mjs',
};
const adapterLaunchers = process.platform === 'win32'
  ? {
      mcp: 'mengine-mcp.cmd',
      cli: 'mengine-agent.cmd',
      http: 'mengine-agent-http.cmd',
    }
  : {
      mcp: 'mengine-mcp',
      cli: 'mengine-agent',
      http: 'mengine-agent-http',
    };

for (const [adapter, entry] of Object.entries(adapterEntries)) {
  const launcher = adapterLaunchers[adapter];
  if (process.platform === 'win32') {
    writeFileSync(
      join(sdkDir, launcher),
      `@echo off\r\n"%~dp0${nodeName}" "%~dp0${entry.replaceAll('/', '\\')}" %*\r\n`,
      'utf8',
    );
  } else {
    writeFileSync(
      join(sdkDir, launcher),
      `#!/bin/sh\nSCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$SCRIPT_DIR/${nodeName}" "$SCRIPT_DIR/${entry}" "$@"\n`,
      'utf8',
    );
    chmodSync(join(sdkDir, launcher), 0o755);
  }
}

const manifest = {
  schemaVersion: 1,
  platform,
  architecture: process.arch,
  nodeVersion: process.version,
  cliVersion: String(cliPackage.version ?? '0.0.0'),
  node: nodeName,
  cli: 'cli/dist/cli.js',
  runtimes: {
    debug: `runtimes/debug/${runtimeName}`,
    release: `runtimes/release/${runtimeName}`,
  },
  agent: {
    version: String(agentPackage.version ?? '0.0.0'),
    ...adapterEntries,
    launchers: adapterLaunchers,
  },
};
writeFileSync(join(sdkDir, 'sdk.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Prepared editor Build SDK: ${sdkDir}`);
console.log(`Node: ${basename(process.execPath)} ${process.version} · CLI: ${cliEntry}`);
