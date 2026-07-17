import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  CanvasTexture,
  Physics,
  Skeleton,
  SkeletonBinary,
  SkeletonJson,
  SkeletonRenderer,
  TextureAtlas,
  type SkeletonData,
} from '@esotericsoftware/spine-canvas';
import {
  loadProjectImage,
  normalizeProjectAssetPath,
  readProjectAssetBytes,
  readProjectAssetText,
  resolveProjectAssetPath,
} from '../projectAssets';

const SUPPORTED_SPINE_SERIES = '4.3';

type SharedSkeletonData = {
  atlas: TextureAtlas;
  data: SkeletonData;
};

type SpineInstance = {
  assetKey: string;
  loadToken: number;
  shared?: SharedSkeletonData;
  skeleton?: Skeleton;
  state?: AnimationState;
  renderer?: SkeletonRenderer;
  rendererContext?: CanvasRenderingContext2D;
  animationKey: string;
  skinKey: string;
  error?: string;
};

export type SpineDrawResult = 'drawn' | 'loading' | 'missing' | { error: string };

const sharedAssets = new Map<string, Promise<SharedSkeletonData>>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const asset of sharedAssets.values()) {
      void asset.then((shared) => shared.atlas.dispose()).catch(() => undefined);
    }
    sharedAssets.clear();
  });
}

function exactSpineSeries(version: string | null | undefined): boolean {
  return typeof version === 'string'
    && (version === SUPPORTED_SPINE_SERIES || version.startsWith(`${SUPPORTED_SPINE_SERIES}.`));
}

async function loadSharedSkeleton(
  skeletonPath: string,
  atlasPath: string,
  premultipliedAlpha: boolean,
): Promise<SharedSkeletonData> {
  const skeletonAsset = normalizeProjectAssetPath(skeletonPath);
  const atlasAsset = normalizeProjectAssetPath(atlasPath);
  const key = `${skeletonAsset}|${atlasAsset}|pma:${premultipliedAlpha}`;
  let promise = sharedAssets.get(key);
  if (promise) return promise;

  promise = (async () => {
    const atlasText = await readProjectAssetText(atlasAsset);
    const atlas = new TextureAtlas(atlasText);
    for (const page of atlas.pages) page.pma = premultipliedAlpha;
    await Promise.all(atlas.pages.map(async (page) => {
      const imagePath = resolveProjectAssetPath(atlasAsset, page.name);
      const image = await loadProjectImage(imagePath);
      page.setTexture(new CanvasTexture(image));
    }));

    const attachmentLoader = new AtlasAttachmentLoader(atlas);
    let data: SkeletonData;
    if (skeletonAsset.toLowerCase().endsWith('.json')) {
      const jsonText = await readProjectAssetText(skeletonAsset);
      const json = JSON.parse(jsonText) as { skeleton?: { spine?: string } };
      const exportedVersion = json.skeleton?.spine;
      if (!exactSpineSeries(exportedVersion)) {
        atlas.dispose();
        throw new Error(
          `Spine export ${exportedVersion ?? 'unknown'} is incompatible; re-export with Spine ${SUPPORTED_SPINE_SERIES}.x`,
        );
      }
      data = new SkeletonJson(attachmentLoader).readSkeletonData(json);
    } else if (skeletonAsset.toLowerCase().endsWith('.skel')) {
      data = new SkeletonBinary(attachmentLoader).readSkeletonData(
        await readProjectAssetBytes(skeletonAsset),
      );
    } else {
      atlas.dispose();
      throw new Error('Spine skeleton must use .json or .skel');
    }

    if (!exactSpineSeries(data.version)) {
      atlas.dispose();
      throw new Error(
        `Spine data ${data.version ?? 'unknown'} is incompatible with runtime ${SUPPORTED_SPINE_SERIES}.x`,
      );
    }
    return { atlas, data };
  })();
  sharedAssets.set(key, promise);
  promise.catch(() => sharedAssets.delete(key));
  return promise;
}

export async function loadSpineInspectorOptions(args: {
  skeleton: string;
  atlas: string;
  premultipliedAlpha?: boolean;
}): Promise<{ animations: string[]; skins: string[] }> {
  const skeleton = args.skeleton.trim();
  const atlas = args.atlas.trim();
  if (!skeleton || !atlas) return { animations: [], skins: [] };
  const shared = await loadSharedSkeleton(
    skeleton,
    atlas,
    args.premultipliedAlpha !== false,
  );
  return {
    animations: shared.data.animations.map((animation) => animation.name),
    skins: shared.data.skins.map((skin) => skin.name),
  };
}

function numberValue(value: unknown, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function configureInstance(instance: SpineInstance, component: Record<string, unknown>): void {
  const skeleton = instance.skeleton!;
  const state = instance.state!;
  const animation = String(component.animation ?? '');
  const loop = component.loop_animation !== false;
  const animationKey = `${animation}|${loop}`;
  if (animationKey !== instance.animationKey) {
    state.clearTracks();
    const selected = animation || instance.shared?.data.animations[0]?.name || '';
    if (selected) state.setAnimation(0, selected, loop);
    instance.animationKey = animationKey;
  }

  const skin = String(component.skin ?? 'default');
  if (skin !== instance.skinKey) {
    if (skin) skeleton.setSkin(skin);
    skeleton.setupPoseSlots();
    instance.skinKey = skin;
  }
  state.timeScale = Math.max(0, numberValue(component.time_scale, 1));

  const tint = Array.isArray(component.color) ? component.color : [1, 1, 1, 1];
  skeleton.color.r = numberValue(tint[0], 1);
  skeleton.color.g = numberValue(tint[1], 1);
  skeleton.color.b = numberValue(tint[2], 1);
  skeleton.color.a = numberValue(tint[3], 1);
}

export class SpineCanvasRuntime {
  private readonly instances = new Map<number, SpineInstance>();

  retainOnly(entityIds: ReadonlySet<number>): void {
    for (const id of this.instances.keys()) {
      if (!entityIds.has(id)) this.instances.delete(id);
    }
  }

  drawEntity(args: {
    entity: number;
    component: Record<string, unknown>;
    context: CanvasRenderingContext2D;
    screenX: number;
    screenY: number;
    pixelsPerWorldUnit: number;
    deltaSeconds: number;
  }): SpineDrawResult {
    const skeletonPath = String(args.component.skeleton ?? '').trim();
    const atlasPath = String(args.component.atlas ?? '').trim();
    if (!skeletonPath || !atlasPath) return 'missing';

    let normalizedSkeleton: string;
    let normalizedAtlas: string;
    try {
      normalizedSkeleton = normalizeProjectAssetPath(skeletonPath);
      normalizedAtlas = normalizeProjectAssetPath(atlasPath);
    } catch (reason) {
      return { error: String(reason) };
    }
    const premultipliedAlpha = args.component.premultiplied_alpha !== false;
    const assetKey = `${normalizedSkeleton}|${normalizedAtlas}|pma:${premultipliedAlpha}`;
    let instance = this.instances.get(args.entity);
    if (!instance || instance.assetKey !== assetKey) {
      instance = {
        assetKey,
        loadToken: (instance?.loadToken ?? 0) + 1,
        animationKey: '',
        skinKey: '',
      };
      this.instances.set(args.entity, instance);
      const token = instance.loadToken;
      void loadSharedSkeleton(normalizedSkeleton, normalizedAtlas, premultipliedAlpha)
        .then((shared) => {
          const current = this.instances.get(args.entity);
          if (!current || current.loadToken !== token || current.assetKey !== assetKey) return;
          current.shared = shared;
          current.skeleton = new Skeleton(shared.data);
          current.state = new AnimationState(new AnimationStateData(shared.data));
          current.animationKey = '';
          current.skinKey = '';
          current.error = undefined;
        })
        .catch((reason) => {
          const current = this.instances.get(args.entity);
          if (current?.loadToken === token) current.error = String(reason);
        });
      return 'loading';
    }
    if (instance.error) return { error: instance.error };
    if (!instance.skeleton || !instance.state) return 'loading';

    try {
      configureInstance(instance, args.component);
      if (args.component.playing !== false) instance.state.update(Math.max(0, args.deltaSeconds));
      instance.state.apply(instance.skeleton);
      instance.skeleton.updateWorldTransform(Physics.update);
      if (!instance.renderer || instance.rendererContext !== args.context) {
        instance.renderer = new SkeletonRenderer(args.context);
        instance.rendererContext = args.context;
      }

      const scale = Math.max(0.0001, numberValue(args.component.scale, 1))
        * 0.01
        * args.pixelsPerWorldUnit;
      args.context.save();
      try {
        args.context.translate(args.screenX, args.screenY);
        args.context.scale(scale, -scale);
        instance.renderer.draw(instance.skeleton);
      } finally {
        args.context.restore();
      }
      return 'drawn';
    } catch (reason) {
      return { error: String(reason) };
    }
  }
}

export const SPINE_RUNTIME_VERSION = '4.3.10';
