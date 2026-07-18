import assert from 'node:assert/strict';
import test from 'node:test';

import { createEnvironmentLightComponent } from '../src/environmentLightModel.ts';
import { BUILTIN_INSPECTOR_FIELDS } from '../src/inspectorMetadata.ts';

test('environment light exposes stable HDR authoring defaults', () => {
  assert.deepEqual(createEnvironmentLightComponent(), {
    sky_color: [0.18, 0.28, 0.5, 1],
    equator_color: [0.12, 0.14, 0.18, 1],
    ground_color: [0.035, 0.04, 0.05, 1],
    diffuse_intensity: 1,
    specular_intensity: 1,
    texture: '',
    rotation_degrees: 0,
    exposure: 0,
  });
});

test('environment exposure is authored as bounded photographic EV', () => {
  assert.deepEqual(BUILTIN_INSPECTOR_FIELDS.EnvironmentLight.exposure, {
    label: 'Exposure (EV)',
    min: -16,
    max: 16,
    step: 0.1,
  });
});
