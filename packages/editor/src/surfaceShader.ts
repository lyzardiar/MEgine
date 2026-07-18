export const SURFACE_SHADER_HOOK_NAME = 'mengine_surface_hook';

export const DEFAULT_SURFACE_SHADER = `fn mengine_surface_hook(
    color: vec4<f32>,
    uv: vec2<f32>,
    world_position: vec3<f32>,
    world_normal: vec3<f32>,
) -> vec4<f32> {
    return color;
}
`;

export function normalizeSurfaceShaderSource(source: string): string {
  return `${String(source ?? '').replace(/\r\n?/g, '\n').trim()}\n`;
}

export function surfaceShaderDiagnostics(source: string): string[] {
  const normalized = normalizeSurfaceShaderSource(source);
  const diagnostics: string[] = [];
  if (new TextEncoder().encode(normalized).byteLength > 256 * 1024) {
    diagnostics.push('Surface Shader must not exceed 256 KiB.');
  }
  if (!new RegExp(`\\bfn\\s+${SURFACE_SHADER_HOOK_NAME}\\s*\\(`).test(normalized)) {
    diagnostics.push(`Missing fn ${SURFACE_SHADER_HOOK_NAME}(...).`);
  }
  for (const token of ['@group', '@binding', '@vertex', '@fragment', '@compute']) {
    if (normalized.includes(token)) diagnostics.push(`${token} is reserved by the engine.`);
  }
  return diagnostics;
}

export function validateSurfaceShaderSource(source: string): void {
  const diagnostics = surfaceShaderDiagnostics(source);
  if (diagnostics.length > 0) throw new Error(diagnostics.join(' '));
}
