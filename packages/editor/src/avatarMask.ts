export type AvatarMaskAsset = {
  version: 1;
  name: string;
  paths: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeAvatarMaskPath(value: unknown): string {
  const path = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (path === '.' || path === '*') return path;
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.')
    .join('/');
}

export function createAvatarMask(name = 'New Avatar Mask'): AvatarMaskAsset {
  return { version: 1, name, paths: [] };
}

export function normalizeAvatarMask(value: unknown): AvatarMaskAsset {
  const source = record(value);
  return {
    version: 1,
    name: String(source.name ?? '').trim(),
    paths: [...new Set((Array.isArray(source.paths) ? source.paths : [])
      .map(normalizeAvatarMaskPath)
      .filter(Boolean))],
  };
}

export function validateAvatarMask(mask: AvatarMaskAsset): void {
  if (mask.paths.some((path) => path !== '*' && path.split('/').includes('..'))) {
    throw new Error('Avatar Mask 路径不能包含 ..');
  }
}

export function parseAvatarMask(text: string): AvatarMaskAsset {
  const mask = normalizeAvatarMask(JSON.parse(text));
  validateAvatarMask(mask);
  return mask;
}

/** Lenient authoring read so an invalid path can still be opened and repaired. */
export function parseAvatarMaskDraft(text: string): AvatarMaskAsset {
  return normalizeAvatarMask(JSON.parse(text));
}

export function serializeAvatarMask(mask: AvatarMaskAsset): string {
  const normalized = normalizeAvatarMask(mask);
  validateAvatarMask(normalized);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
