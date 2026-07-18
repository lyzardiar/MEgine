export type Light2DComponent = {
  light_type?: unknown;
  color?: unknown;
  intensity?: unknown;
  radius?: unknown;
  inner_radius?: unknown;
  falloff?: unknown;
  sorting_layers?: unknown;
};

export type Light2DInstance = {
  position: [number, number];
  component: Light2DComponent;
};

export type PreparedLight2D = {
  global: boolean;
  position: [number, number];
  color: [number, number, number];
  intensity: number;
  radius: number;
  innerRadius: number;
  falloff: number;
  sortingLayers: string[];
};

const MAX_LIGHT_MULTIPLIER = 16;

export function prepareLight2DLights(
  lights: readonly Light2DInstance[],
): PreparedLight2D[] {
  return lights.slice(0, 128).map(({ component, position }) => {
    const radius = Math.max(0.001, Math.abs(finite(component.radius, 5)));
    const color = normalizeColor(component.color, [1, 1, 1, 1]);
    return {
      global: String(component.light_type ?? 'point').trim().toLowerCase() === 'global',
      position: [finite(position[0], 0), finite(position[1], 0)],
      color: [color[0], color[1], color[2]],
      intensity: clamp(finite(component.intensity, 1), 0, MAX_LIGHT_MULTIPLIER) * color[3],
      radius,
      innerRadius: clamp(finite(component.inner_radius, 0), 0, radius),
      falloff: clamp(finite(component.falloff, 1), 0.01, 8),
      sortingLayers: Array.isArray(component.sorting_layers)
        ? component.sorting_layers
            .map(String)
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean)
        : [],
    };
  });
}

export function modulateLight2DColor(
  baseColor: readonly number[],
  position: readonly number[],
  sortingLayer: string,
  lights: readonly PreparedLight2D[],
): [number, number, number, number] {
  const base = normalizeColor(baseColor, [1, 1, 1, 1]);
  if (lights.length === 0) return base;
  const multiplier = sampleLight2D(position, sortingLayer, lights);
  return [
    Math.min(MAX_LIGHT_MULTIPLIER, base[0] * multiplier[0]),
    Math.min(MAX_LIGHT_MULTIPLIER, base[1] * multiplier[1]),
    Math.min(MAX_LIGHT_MULTIPLIER, base[2] * multiplier[2]),
    base[3],
  ];
}

export function sampleLight2D(
  position: readonly number[],
  sortingLayer: string,
  lights: readonly PreparedLight2D[],
): [number, number, number] {
  const worldX = finite(position[0], 0);
  const worldY = finite(position[1], 0);
  const layer = sortingLayer.trim().toLowerCase();
  const result: [number, number, number] = [0, 0, 0];
  for (const light of lights) {
    if (light.sortingLayers.length > 0 && !light.sortingLayers.includes(layer)) continue;
    let attenuation = 1;
    if (!light.global) {
      const distance = Math.hypot(
        worldX - light.position[0],
        worldY - light.position[1],
      );
      if (distance >= light.radius) attenuation = 0;
      else if (distance > light.innerRadius) {
        attenuation = (
          1 - (distance - light.innerRadius) / Math.max(0.001, light.radius - light.innerRadius)
        ) ** light.falloff;
      }
    }
    const energy = light.intensity * attenuation;
    for (let channel = 0; channel < 3; channel += 1) {
      result[channel] = Math.min(
        MAX_LIGHT_MULTIPLIER,
        result[channel] + light.color[channel] * energy,
      );
    }
  }
  return result;
}

function normalizeColor(
  value: unknown,
  fallback: [number, number, number, number],
): [number, number, number, number] {
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((channel, index) =>
    clamp(finite(value[index], channel), 0, index === 3 ? 1 : MAX_LIGHT_MULTIPLIER),
  ) as [number, number, number, number];
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
