export function parseAlwaysIncludeDraft(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

export function buildAssetPathsDirty(
  draft: string,
  savedPaths: readonly string[],
): boolean {
  const paths = parseAlwaysIncludeDraft(draft);
  return paths.length !== savedPaths.length
    || paths.some((path, index) => path !== savedPaths[index]);
}

export function buildAssetPolicyEqual(
  left: {
    assetMode: string;
    alwaysInclude: readonly string[];
    shaderVariantLimit: number;
  },
  right: {
    assetMode: string;
    alwaysInclude: readonly string[];
    shaderVariantLimit: number;
  },
): boolean {
  return left.assetMode === right.assetMode
    && left.shaderVariantLimit === right.shaderVariantLimit
    && left.alwaysInclude.length === right.alwaysInclude.length
    && left.alwaysInclude.every((path, index) => path === right.alwaysInclude[index]);
}

export function buildAssetPolicyUpdate(
  draft: string,
  current: {
    revision: string;
    assetMode: string;
    alwaysInclude: readonly string[];
    shaderVariantLimit: number;
  },
  next: {
    revision: string;
    assetMode: string;
    alwaysInclude: readonly string[];
    shaderVariantLimit: number;
  },
  draftRevision: string | null,
): 'reload' | 'advance-revision' | 'conflict' {
  if (!buildAssetPathsDirty(draft, current.alwaysInclude)) return 'reload';
  return buildAssetPolicyEqual(current, next) && draftRevision === current.revision
    ? 'advance-revision'
    : 'conflict';
}
