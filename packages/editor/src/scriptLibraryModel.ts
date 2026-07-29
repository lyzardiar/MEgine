export type ScriptAsset = {
  id: string;
  name: string;
  folder: string;
  absPath: string;
};

export type IndexedScriptAsset = {
  name: string;
  folder: string;
  relPath: string;
  kind: string;
};

function projectAbsolutePath(projectRoot: string, relativePath: string): string {
  const separator = projectRoot.includes('\\') ? '\\' : '/';
  return `${projectRoot.replace(/[\\/]+$/, '')}${separator}${
    relativePath.replace(/[\\/]/g, separator)
  }`;
}

/** Build the desktop script index from the active native project only. */
export function desktopScriptAssets(
  projectRoot: string,
  assets: readonly IndexedScriptAsset[],
): ScriptAsset[] {
  if (!/^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(projectRoot)) return [];
  return assets.flatMap((asset) => {
    const relativePath = asset.relPath.replace(/\\/g, '/');
    const segments = relativePath.split('/');
    if (
      asset.kind !== 'script'
      || segments[0] !== 'Assets'
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
      || asset.name.toLocaleLowerCase().endsWith('.d.ts')
      || asset.name.toLocaleLowerCase() === 'index.ts'
    ) {
      return [];
    }
    return [{
      id: `project/${relativePath}`,
      name: asset.name,
      folder: asset.folder.replace(/\\/g, '/'),
      absPath: projectAbsolutePath(projectRoot, relativePath),
    }];
  }).sort((left, right) => (
    left.folder.localeCompare(right.folder)
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id)
  ));
}

/** External URI used only after an explicit user script-open action. */
export function vscodeFileUri(absolutePath: string): string | null {
  if (!/^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(absolutePath)) return null;
  const normalized = absolutePath.replace(/\\/g, '/');
  const encoded = normalized
    .split('/')
    .map((segment, index) => (
      index === 0 && /^[a-zA-Z]:$/.test(segment)
        ? segment
        : encodeURIComponent(segment)
    ))
    .join('/');
  return `vscode://file/${encoded}:1`;
}
