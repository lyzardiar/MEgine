import {
  MAX_SURFACE_SHADER_PARAMETERS,
  MAX_SURFACE_SHADER_TEXTURES,
  type SurfaceShaderParameter,
  type SurfaceShaderTexture,
} from './surfaceShader.ts';

export type MaterialPropertyBlockBindingDiagnostic = {
  field: 'custom_parameters' | 'custom_textures';
  message: string;
};

export function isMaterialPropertyBlockTextureAsset(asset: { relPath: string }): boolean {
  return /\.(?:png|jpe?g|webp|gif|bmp|tga)$/i.test(asset.relPath);
}

export function materialPropertyParameterMap(
  data: Readonly<Record<string, unknown>>,
): Map<string, [number, number, number, number]> {
  const names = Array.isArray(data.custom_parameter_names) ? data.custom_parameter_names : [];
  const values = Array.isArray(data.custom_parameter_values) ? data.custom_parameter_values : [];
  const result = new Map<string, [number, number, number, number]>();
  for (let index = 0; index < Math.min(names.length, values.length); index += 1) {
    const name = typeof names[index] === 'string' ? names[index] : '';
    const value = values[index];
    if (!name || !Array.isArray(value) || value.length !== 4) continue;
    result.set(name, [0, 1, 2, 3].map(
      (component) => Number(value[component]),
    ) as [number, number, number, number]);
  }
  return result;
}

export function materialPropertyTextureMap(
  data: Readonly<Record<string, unknown>>,
): Map<string, string> {
  const names = Array.isArray(data.custom_texture_names) ? data.custom_texture_names : [];
  const values = Array.isArray(data.custom_texture_values) ? data.custom_texture_values : [];
  const result = new Map<string, string>();
  for (let index = 0; index < Math.min(names.length, values.length); index += 1) {
    if (typeof names[index] === 'string' && names[index]
      && typeof values[index] === 'string') {
      result.set(names[index], values[index].trim().replaceAll('\\', '/'));
    }
  }
  return result;
}

export function materialPropertyBlockBindingDiagnostics(
  data: Readonly<Record<string, unknown>>,
  parameters: readonly SurfaceShaderParameter[],
  textures: readonly SurfaceShaderTexture[],
): MaterialPropertyBlockBindingDiagnostic[] {
  const diagnostics: MaterialPropertyBlockBindingDiagnostic[] = [];
  const parameterNames = Array.isArray(data.custom_parameter_names)
    ? data.custom_parameter_names : [];
  const parameterValues = Array.isArray(data.custom_parameter_values)
    ? data.custom_parameter_values : [];
  if (parameterNames.length !== parameterValues.length) {
    diagnostics.push({
      field: 'custom_parameters',
      message: 'Custom parameter names and values must have equal lengths.',
    });
  }
  if (parameterNames.length > MAX_SURFACE_SHADER_PARAMETERS) {
    diagnostics.push({
      field: 'custom_parameters',
      message: `Material Property Block cannot override more than ${MAX_SURFACE_SHADER_PARAMETERS} custom parameters.`,
    });
  }
  const declaredParameters = new Set(parameters.map((parameter) => parameter.name));
  const seenParameters = new Set<string>();
  for (let index = 0; index < Math.min(parameterNames.length, parameterValues.length); index += 1) {
    const name = typeof parameterNames[index] === 'string' ? parameterNames[index] : '';
    const value = parameterValues[index];
    if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name)
      || seenParameters.has(name)
      || !declaredParameters.has(name)
      || !Array.isArray(value)
      || value.length !== 4
      || value.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
      diagnostics.push({
        field: 'custom_parameters',
        message: `Invalid, duplicate, or stale custom parameter '${name || `#${index + 1}`}'.`,
      });
    }
    seenParameters.add(name);
  }

  const textureNames = Array.isArray(data.custom_texture_names)
    ? data.custom_texture_names : [];
  const textureValues = Array.isArray(data.custom_texture_values)
    ? data.custom_texture_values : [];
  if (textureNames.length !== textureValues.length) {
    diagnostics.push({
      field: 'custom_textures',
      message: 'Custom texture names and values must have equal lengths.',
    });
  }
  if (textureNames.length > MAX_SURFACE_SHADER_TEXTURES) {
    diagnostics.push({
      field: 'custom_textures',
      message: `Material Property Block cannot override more than ${MAX_SURFACE_SHADER_TEXTURES} custom textures.`,
    });
  }
  const declaredTextures = new Set(textures.map((texture) => texture.name));
  const seenTextures = new Set<string>();
  for (let index = 0; index < Math.min(textureNames.length, textureValues.length); index += 1) {
    const name = typeof textureNames[index] === 'string' ? textureNames[index] : '';
    const path: string = typeof textureValues[index] === 'string'
      ? textureValues[index].trim().replaceAll('\\', '/') : '';
    const safePath = !path || (
      path.startsWith('Assets/')
      && isMaterialPropertyBlockTextureAsset({ relPath: path })
      && !path.split('/').some((segment: string) => (
        !segment || segment === '.' || segment === '..'
      ))
    );
    if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name)
      || seenTextures.has(name)
      || !declaredTextures.has(name)
      || typeof textureValues[index] !== 'string'
      || !safePath) {
      diagnostics.push({
        field: 'custom_textures',
        message: `Invalid, duplicate, or stale custom texture '${name || `#${index + 1}`}'.`,
      });
    }
    seenTextures.add(name);
  }
  return diagnostics;
}
