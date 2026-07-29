export type WorkspaceResourceDocumentKind =
  | 'animation'
  | 'timeline'
  | 'animator'
  | 'avatar-mask'
  | 'material'
  | 'material-instance'
  | 'shader'
  | 'sprite'
  | 'sprite-atlas';

export type WorkspaceResourceDocument = {
  kind: WorkspaceResourceDocumentKind;
  panel: string;
  path: string;
  dirty: boolean;
  selected: boolean;
};

function comparablePath(path: string): string {
  return path.replace(/\\/g, '/').toLocaleLowerCase();
}

export function resourceEditorDocuments(
  kind: WorkspaceResourceDocumentKind,
  panel: string,
  currentPath: string | null,
  currentDirty: boolean,
  drafts: Iterable<readonly [string, boolean]>,
): WorkspaceResourceDocument[] {
  const byPath = new Map<string, WorkspaceResourceDocument>();
  for (const [path, dirty] of drafts) {
    if (!path) continue;
    byPath.set(comparablePath(path), {
      kind,
      panel,
      path,
      dirty,
      selected: false,
    });
  }
  if (currentPath) {
    byPath.set(comparablePath(currentPath), {
      kind,
      panel,
      path: currentPath,
      dirty: currentDirty,
      selected: true,
    });
  }
  return [...byPath.values()].sort((left, right) => (
    Number(right.selected) - Number(left.selected)
    || left.path.localeCompare(right.path)
  ));
}

export function mergeWorkspaceResourceDocuments(
  ...groups: readonly (readonly WorkspaceResourceDocument[])[]
): WorkspaceResourceDocument[] {
  const documents = new Map<string, WorkspaceResourceDocument>();
  for (const group of groups) {
    for (const document of group) {
      const key = `${document.panel}\u0000${document.kind}\u0000${comparablePath(document.path)}`;
      const previous = documents.get(key);
      documents.set(key, previous
        ? {
            ...previous,
            dirty: previous.dirty || document.dirty,
            selected: previous.selected || document.selected,
          }
        : structuredClone(document));
    }
  }
  return [...documents.values()].sort((left, right) => (
    left.panel.localeCompare(right.panel)
    || Number(right.selected) - Number(left.selected)
    || left.kind.localeCompare(right.kind)
    || left.path.localeCompare(right.path)
  ));
}

export function gateWorkspaceResourceSelection(
  documents: readonly WorkspaceResourceDocument[],
  routeActive: boolean,
): WorkspaceResourceDocument[] {
  return documents.map((document) => ({
    ...document,
    selected: routeActive && document.selected,
  }));
}
