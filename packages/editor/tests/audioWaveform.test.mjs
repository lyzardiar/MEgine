import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAudioWaveform,
  sampleAudioWaveform,
} from '../src/audioWaveform.ts';

test('audio waveform combines channels into stable min and max buckets', () => {
  const waveform = buildAudioWaveform([
    new Float32Array([-1, -0.5, 0.5, 1]),
    new Float32Array([0.25, -0.25, 0.75, -0.75]),
  ], 4, 2);
  assert.deepEqual(waveform, {
    duration: 4,
    peaks: [
      { min: -1, max: 0.25 },
      { min: -0.75, max: 1 },
    ],
  });
});

test('audio waveform sampling follows clip-in, pitch, silence and looping', () => {
  const waveform = {
    duration: 4,
    peaks: [
      { min: -1, max: 1 },
      { min: -0.5, max: 0.5 },
      { min: -0.25, max: 0.25 },
      { min: -0.1, max: 0.1 },
    ],
  };
  assert.deepEqual(sampleAudioWaveform(waveform, 1, 1, 2, false, 2), [
    { min: -0.5, max: 0.5 },
    { min: -0.25, max: 0.25 },
  ]);
  assert.deepEqual(sampleAudioWaveform(waveform, 3, 1, 2, true, 2), [
    { min: -0.1, max: 0.1 },
    { min: -1, max: 1 },
  ]);
  assert.deepEqual(sampleAudioWaveform(waveform, 0, 2, 2, false, 2), [
    { min: -1, max: 1 },
    { min: -0.25, max: 0.25 },
  ]);
  assert.deepEqual(sampleAudioWaveform(waveform, 4, 1, 1, false, 2), [
    { min: 0, max: 0 },
    { min: 0, max: 0 },
  ]);
});
