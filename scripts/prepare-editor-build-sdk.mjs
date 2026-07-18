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
mkdirSync(join(sdkDir, 'node_modules'), { recursive: true });
mkdirSync(join(sdkDir, 'runtimes', 'debug'), { recursive: true });
mkdirSync(join(sdkDir, 'runtimes', 'release'), { recursive: true });
mkdirSync(join(sdkDir, 'licenses'), { recursive: true });
writeFileSync(join(sdkDir, '.gitkeep'), '');

copyFileSync(process.execPath, join(sdkDir, nodeName));
cpSync(join(cliDir, 'dist'), join(sdkDir, 'cli', 'dist'), { recursive: true, dereference: true });
copyFileSync(join(cliDir, 'package.json'), join(sdkDir, 'cli', 'package.json'));
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
};
writeFileSync(join(sdkDir, 'sdk.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Prepared editor Build SDK: ${sdkDir}`);
console.log(`Node: ${basename(process.execPath)} ${process.version} · CLI: ${cliEntry}`);
