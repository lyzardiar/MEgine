// Author: MiYu. Prepare Cargo's V8 build paths before any dependency build scripts run.
import { lstatSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function commandOutput(command, args, cwd, timeout) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

export function ensureJunction(link, source) {
  const target = realpathSync(source);
  try {
    lstatSync(link);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(target, link, 'junction');
  }
  if (realpathSync(link).toLowerCase() !== target.toLowerCase()) {
    throw new Error(`V8 build link points to another source; inspect and remove ${link} before rebuilding`);
  }
}

export function selectedBackend() {
  const backend = process.env.MENGINE_SCRIPT_RUNTIME || 'v8';
  if (!['v8', 'quickjs'].includes(backend)) throw new Error('MENGINE_SCRIPT_RUNTIME must be v8 or quickjs');
  return backend;
}

export function backendCargoArgs(backend = selectedBackend()) {
  return ['--no-default-features', '--features', `${backend}-runtime`];
}

function locateNativeOutput(root) {
  const metadata = JSON.parse(commandOutput('cargo', ['metadata', '--format-version', '1', '--no-deps', '--locked'], root));
  return process.env.CARGO_BUILD_TARGET ? join(metadata.target_directory, process.env.CARGO_BUILD_TARGET) : metadata.target_directory;
}

export function prepareNativeBuild(root, profiles = ['debug', 'release'], backend = selectedBackend()) {
  if (backend === 'quickjs') return locateNativeOutput(root);
  const target = process.env.CARGO_BUILD_TARGET;
  const host = commandOutput('rustc', ['-vV'], root).match(/^host: (.+)$/m)?.[1];
  if (!host) throw new Error('Cannot determine the Rust host target');
  const metadata = JSON.parse(commandOutput('cargo', [
    'metadata', '--format-version', '1', '--locked', '--filter-platform', target || host,
    '--manifest-path', join(root, 'crates/mengine-runtime/Cargo.toml'), ...backendCargoArgs(backend),
  ], root));
  const output = target ? join(metadata.target_directory, target) : metadata.target_directory;
  if (process.platform === 'win32' && backend === 'v8') {
    const dependency = metadata.packages.find(pkg => pkg.name === 'v8');
    if (!dependency) throw new Error('V8 dependency is missing from Cargo metadata');
    const source = dirname(dependency.manifest_path);
    if (parse(realpathSync(source)).root.toLowerCase() !== parse(resolve(output)).root.toLowerCase()) {
      for (const profile of profiles) ensureJunction(join(output, profile, 'gn_root'), source);
    }
  }
  return output;
}

export function inspectRuntime(executable, backend = selectedBackend()) {
  const identity = JSON.parse(commandOutput(executable, ['--runtime-info'], dirname(executable), 30000));
  if (identity.backend !== backend || typeof identity.version !== 'string' || identity.bridgeVersion !== 1) {
    throw new Error(`Player script runtime mismatch: expected ${backend}, found ${JSON.stringify(identity)} in ${executable}`);
  }
  return identity;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let targetDirectory;
  if (process.argv.includes('--locate-only')) {
    targetDirectory = locateNativeOutput(root);
  } else {
    targetDirectory = prepareNativeBuild(root);
  }
  console.log(JSON.stringify({ targetDirectory }));
}
