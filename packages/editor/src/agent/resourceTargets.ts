import type { ProjectFileAsset } from '../projectAssets';

export type AgentResourceEditorKind =
  | 'animation'
  | 'animator'
  | 'avatar-mask'
  | 'material'
  | 'material-instance'
  | 'shader'
  | 'sprite'
  | 'sprite-atlas'
  | 'timeline';

export type AgentResourceEditorTarget = {
  kind: AgentResourceEditorKind;
  panel: string;
  path: string;
};

export type AgentInstantiableAssetTarget = {
  kind: 'prefab' | 'model' | 'sprite';
  path: string;
};

const SPRITE_TEXTURE_EXTENSION = /\.(?:png|jpe?g|webp|gif)$/i;

export function animatorDocumentKind(path: string | null): 'animator' | 'avatar-mask' {
  return path?.toLocaleLowerCase().endsWith('.mavatar') ? 'avatar-mask' : 'animator';
}

export function materialDocumentKind(path: string | null): 'material' | 'material-instance' {
  return path?.toLocaleLowerCase().endsWith('.minst') ? 'material-instance' : 'material';
}

export function resourceEditorTarget(
  asset: ProjectFileAsset,
): AgentResourceEditorTarget | null {
  const target = (() => {
    switch (asset.kind) {
      case 'animation':
        return { kind: 'animation', panel: 'timeline' } as const;
      case 'animator-controller':
        return { kind: 'animator', panel: 'animator' } as const;
      case 'avatar-mask':
        return { kind: 'avatar-mask', panel: 'animator' } as const;
      case 'material':
        return asset.relPath.toLocaleLowerCase().endsWith('.minst')
          ? { kind: 'material-instance', panel: 'material' } as const
          : { kind: 'material', panel: 'material' } as const;
      case 'shader':
        return { kind: 'shader', panel: 'shader' } as const;
      case 'texture':
        return SPRITE_TEXTURE_EXTENSION.test(asset.relPath)
          ? { kind: 'sprite', panel: 'spriteEditor' } as const
          : null;
      case 'sprite-atlas':
        return { kind: 'sprite-atlas', panel: 'spriteAtlas' } as const;
      case 'timeline':
        return { kind: 'timeline', panel: 'timeline' } as const;
      default:
        return null;
    }
  })();
  return target ? { ...target, path: asset.relPath } : null;
}

export function instantiableAssetTarget(
  asset: ProjectFileAsset,
): AgentInstantiableAssetTarget | null {
  switch (asset.kind) {
    case 'prefab':
      return { kind: 'prefab', path: asset.relPath };
    case 'model':
      return { kind: 'model', path: asset.relPath };
    case 'texture':
      return SPRITE_TEXTURE_EXTENSION.test(asset.relPath)
        ? { kind: 'sprite', path: asset.relPath }
        : null;
    default:
      return null;
  }
}
