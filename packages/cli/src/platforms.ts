/**
 * Multi-platform build target registry for `@mengine/cli`.
 * Mirrors `crates/mengine-platform/src/adapter.rs` capabilities 1:1.
 */

export type BuildTargetId =
  | 'windows-x64'
  | 'macos-arm64'
  | 'linux-x64'
  | 'android-arm64'
  | 'ios-arm64'
  | 'web-wasm';

export type TargetSupportStage = 'active' | 'adapter-reserved';
export type TargetScriptBackend = 'v8' | 'quickjs' | 'web-native-js';
export type TargetGraphicsBackend = 'dx12' | 'metal' | 'vulkan' | 'gles' | 'webgpu' | 'webgl2';

export interface BuildTargetSpec {
  id: BuildTargetId;
  label: string;
  stage: TargetSupportStage;
  rustTriple: string;
  scriptBackend: TargetScriptBackend;
  graphicsPrimary: TargetGraphicsBackend;
  graphicsFallback: TargetGraphicsBackend | null;
  cargoFeatures: string[];
  shellDir: string;
}

export const BUILD_TARGETS: Record<BuildTargetId, BuildTargetSpec> = {
  'windows-x64': {
    id: 'windows-x64',
    label: 'Windows (x64)',
    stage: 'active',
    rustTriple: 'x86_64-pc-windows-msvc',
    scriptBackend: 'v8',
    graphicsPrimary: 'dx12',
    graphicsFallback: 'vulkan',
    cargoFeatures: ['v8-runtime'],
    shellDir: 'platforms/desktop',
  },
  'macos-arm64': {
    id: 'macos-arm64',
    label: 'macOS (Apple Silicon)',
    stage: 'adapter-reserved',
    rustTriple: 'aarch64-apple-darwin',
    scriptBackend: 'v8',
    graphicsPrimary: 'metal',
    graphicsFallback: null,
    cargoFeatures: ['v8-runtime'],
    shellDir: 'platforms/desktop',
  },
  'linux-x64': {
    id: 'linux-x64',
    label: 'Linux (x64)',
    stage: 'adapter-reserved',
    rustTriple: 'x86_64-unknown-linux-gnu',
    scriptBackend: 'v8',
    graphicsPrimary: 'vulkan',
    graphicsFallback: 'gles',
    cargoFeatures: ['v8-runtime'],
    shellDir: 'platforms/desktop',
  },
  'android-arm64': {
    id: 'android-arm64',
    label: 'Android (arm64-v8a)',
    stage: 'active',
    rustTriple: 'aarch64-linux-android',
    scriptBackend: 'v8',
    graphicsPrimary: 'vulkan',
    graphicsFallback: 'gles',
    cargoFeatures: ['v8-runtime'],
    shellDir: 'platforms/android',
  },
  'ios-arm64': {
    id: 'ios-arm64',
    label: 'iOS (arm64)',
    stage: 'adapter-reserved',
    rustTriple: 'aarch64-apple-ios',
    scriptBackend: 'quickjs',
    graphicsPrimary: 'metal',
    graphicsFallback: null,
    cargoFeatures: ['quickjs-runtime'],
    shellDir: 'platforms/ios',
  },
  'web-wasm': {
    id: 'web-wasm',
    label: 'Web (WASM + Browser Native JS)',
    stage: 'active',
    rustTriple: 'wasm32-unknown-unknown',
    scriptBackend: 'web-native-js',
    graphicsPrimary: 'webgpu',
    graphicsFallback: 'webgl2',
    cargoFeatures: [],
    shellDir: 'platforms/web',
  },
};

export function listBuildTargets(includeReserved = true): BuildTargetSpec[] {
  const all = Object.values(BUILD_TARGETS);
  return includeReserved ? all : all.filter((item) => item.stage === 'active');
}

export function resolveBuildTarget(id: string): BuildTargetSpec {
  if (id in BUILD_TARGETS) {
    return BUILD_TARGETS[id as BuildTargetId];
  }
  throw new Error(
    `Unknown target '${id}'. Supported targets: ${Object.keys(BUILD_TARGETS).join(', ')}`,
  );
}
