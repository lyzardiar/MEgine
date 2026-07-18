export type EnvironmentLightComponent = {
  sky_color: [number, number, number, number];
  equator_color: [number, number, number, number];
  ground_color: [number, number, number, number];
  diffuse_intensity: number;
  specular_intensity: number;
  texture: string;
  rotation_degrees: number;
  background_enabled: boolean;
  background_intensity: number;
  exposure: number;
};

/** Shared authoring defaults used by Add Component and GameObject creation. */
export function createEnvironmentLightComponent(): EnvironmentLightComponent {
  return {
    sky_color: [0.18, 0.28, 0.5, 1],
    equator_color: [0.12, 0.14, 0.18, 1],
    ground_color: [0.035, 0.04, 0.05, 1],
    diffuse_intensity: 1,
    specular_intensity: 1,
    texture: '',
    rotation_degrees: 0,
    background_enabled: true,
    background_intensity: 1,
    exposure: 0,
  };
}
