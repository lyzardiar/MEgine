import { createEffekseerEffect, createUiEffekseerComponents } from './componentCatalog.ts';
import { stretchRectTransform } from './ui/rectLayout.ts';

export type EffekseerCompositionLayerPlan = {
  name: string;
  components: Record<string, unknown>;
};

export type EffekseerCompositionPlan = {
  name: string;
  mode: 'world' | 'screen';
  rootComponents: Record<string, unknown>;
  layers: EffekseerCompositionLayerPlan[];
};

function finiteTuple(value: unknown, length: number, fallback: number[]): number[] {
  return Array.isArray(value)
    && value.length === length
    && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? [...value]
    : [...fallback];
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

export function buildEffekseerCompositionPlan(
  input: Record<string, unknown>,
  availableEffects: ReadonlySet<string>,
): EffekseerCompositionPlan {
  const name = typeof input.name === 'string' && input.name.trim()
    ? input.name.trim().slice(0, 80)
    : 'Agent Effect';
  const mode = input.mode === 'screen' ? 'screen' : input.mode === 'world' ? 'world' : null;
  if (!mode) throw new Error('mode must be world or screen');
  if (!Array.isArray(input.layers) || input.layers.length === 0 || input.layers.length > 16) {
    throw new Error('layers must contain between 1 and 16 effect layers');
  }
  const known = new Set([...availableEffects].map((path) => path.replace(/\\/g, '/').toLocaleLowerCase()));
  const layers = input.layers.map((value, index): EffekseerCompositionLayerPlan => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`layers[${index}] must be an object`);
    }
    const raw = value as Record<string, unknown>;
    const effect = typeof raw.effect === 'string' ? raw.effect.trim().replace(/\\/g, '/') : '';
    if (!/^Assets\/.+\.efk(?:efc)?$/i.test(effect) || !known.has(effect.toLocaleLowerCase())) {
      throw new Error(`layers[${index}].effect is not an indexed Effekseer asset: ${effect || '(empty)'}`);
    }
    const layerName = typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 80)
      : `${name} Layer ${index + 1}`;
    const component = {
      ...createEffekseerEffect(),
      effect,
      looping: raw.looping !== false,
      speed: finite(raw.speed, 1, 0.05, 8),
      start_frame: Math.round(finite(raw.startFrame, 0, 0, 100_000)),
      prewarm: raw.prewarm === true,
      auto_destroy: false,
      render_mode: mode,
      screen_scale: finite(raw.screenScale, mode === 'screen' ? 1 : 0.12, 0.001, 100),
      sorting_order: Math.round(finite(raw.sortingOrder, index, -32_768, 32_767)),
    };
    if (mode === 'screen') {
      const components = createUiEffekseerComponents();
      components.RectTransform = {
        ...(components.RectTransform as Record<string, unknown>),
        anchored_position: finiteTuple(raw.anchoredPosition, 2, [0, 0]),
        size_delta: finiteTuple(raw.size, 2, [320, 320]).map((part) => Math.max(1, Math.abs(part))),
      };
      components.EffekseerEffect = component;
      return { name: layerName, components };
    }
    return {
      name: layerName,
      components: {
        Transform: {
          position: finiteTuple(raw.position, 3, [0, 0, 0]),
          rotation: finiteTuple(raw.rotation, 4, [0, 0, 0, 1]),
          scale: finiteTuple(raw.scale, 3, [1, 1, 1]),
        },
        EffekseerEffect: component,
      },
    };
  });
  return {
    name,
    mode,
    rootComponents: mode === 'screen'
      ? { RectTransform: stretchRectTransform() }
      : { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
    layers,
  };
}
