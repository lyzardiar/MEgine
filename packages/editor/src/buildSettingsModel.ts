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
