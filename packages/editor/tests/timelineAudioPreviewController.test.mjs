import assert from 'node:assert/strict';
import test from 'node:test';

import { TimelineAudioPreviewController } from '../src/timelineAudioPreviewController.ts';

class FakeParam {
  value = 0;
  cancelScheduledValues() {}
  setTargetAtTime(value) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
}

class FakeNode {
  connected = [];
  disconnected = false;
  connect(target) { this.connected.push(target); return target; }
  disconnect() { this.disconnected = true; }
}

class FakeSource extends FakeNode {
  buffer = null;
  loop = false;
  playbackRate = new FakeParam();
  onended = null;
  starts = [];
  stops = [];
  start(when, offset) { this.starts.push({ when, offset }); }
  stop(when) { this.stops.push(when); }
  finish() { this.onended?.(); }
}

function createBackend(options = {}) {
  const sources = [];
  const gains = [];
  const panners = [];
  const context = {
    currentTime: 10,
    destination: {},
    createBufferSource() {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    createGain() {
      const gain = new FakeNode();
      gain.gain = new FakeParam();
      gains.push(gain);
      return gain;
    },
    createStereoPanner() {
      const panner = new FakeNode();
      panner.pan = new FakeParam();
      panners.push(panner);
      return panner;
    },
  };
  return {
    context,
    sources,
    gains,
    panners,
    backend: {
      context: () => context,
      load: options.load ?? (async () => ({ duration: 2 })),
      unlock: options.unlock ?? (async () => {}),
    },
  };
}

const item = {
  key: 'music',
  label: 'Music',
  target: 7,
  clip: 'Assets/Audio/Music.wav',
  clipStart: 0,
  clipIn: 0.5,
  sourceTime: 0.5,
  volume: 0.8,
  pitch: 2,
  looped: false,
  muted: false,
  pan: 0.25,
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('Timeline audio preview keeps a continuous voice and corrects discontinuous seeks', async () => {
  const fake = createBackend();
  const statuses = [];
  const controller = new TimelineAudioPreviewController((status) => statuses.push(status), fake.backend);

  controller.update([item], true, 0);
  await flush();
  assert.equal(fake.sources.length, 1);
  assert.deepEqual(fake.sources[0].starts, [{ when: 10, offset: 0.5 }]);
  assert.equal(fake.sources[0].playbackRate.value, 2);
  assert.equal(fake.gains[0].gain.value, 0.8);
  assert.equal(fake.panners[0].pan.value, 0.25);
  assert.deepEqual(statuses.at(-1), { mode: 'playing', voices: 1, diagnostics: [] });

  fake.context.currentTime = 10.05;
  controller.update([{ ...item, sourceTime: 0.6, volume: 0.4 }], true, 0);
  assert.equal(fake.sources.length, 1);
  assert.equal(fake.gains[0].gain.value, 0.4);

  controller.update([{ ...item, sourceTime: 1.5 }], true, 0);
  await flush();
  assert.equal(fake.sources.length, 2);
  assert.equal(fake.sources[0].disconnected, true);
  assert.deepEqual(fake.sources[1].starts, [{ when: 10.05, offset: 1.5 }]);

  controller.update([], false, 0);
  assert.equal(fake.sources[1].disconnected, true);
  assert.deepEqual(statuses.at(-1), { mode: 'idle', voices: 0, diagnostics: [] });
  controller.dispose();
});

test('Timeline audio scrub debounces pointer movement into one short audition grain', async () => {
  const fake = createBackend();
  const statuses = [];
  const controller = new TimelineAudioPreviewController((status) => statuses.push(status), fake.backend);

  controller.update([item], false, 0);
  controller.update([item], false, 1);
  controller.update([{ ...item, sourceTime: 0.75 }], false, 2);
  await new Promise((resolve) => setTimeout(resolve, 40));
  await flush();

  assert.equal(fake.sources.length, 1);
  assert.deepEqual(fake.sources[0].starts, [{ when: 10, offset: 0.75 }]);
  assert.deepEqual(fake.sources[0].stops, [10.12]);
  assert.equal(statuses.at(-1).mode, 'scrubbing');
  assert.equal(statuses.at(-1).voices, 1);

  fake.sources[0].finish();
  assert.deepEqual(statuses.at(-1), { mode: 'idle', voices: 0, diagnostics: [] });
  controller.dispose();
});

test('Timeline audio preview reports only failures for the current active clip', async () => {
  const fake = createBackend({ load: async () => { throw new Error('decode failed'); } });
  const statuses = [];
  const controller = new TimelineAudioPreviewController((status) => statuses.push(status), fake.backend);

  controller.update([item], true, 0);
  await flush();
  assert.match(statuses.at(-1).diagnostics[0], /Music\.wav.*decode failed/);

  controller.update([], true, 0);
  assert.deepEqual(statuses.at(-1), { mode: 'idle', voices: 0, diagnostics: [] });
  controller.dispose();
});

test('Timeline audio controller can reactivate after a StrictMode effect cleanup', async () => {
  const fake = createBackend();
  const statuses = [];
  const controller = new TimelineAudioPreviewController((status) => statuses.push(status), fake.backend);

  controller.dispose();
  controller.update([item], true, 0);
  await flush();
  assert.equal(fake.sources.length, 0);

  controller.activate();
  controller.update([item], true, 0);
  await flush();
  assert.equal(fake.sources.length, 1);
  assert.deepEqual(statuses.at(-1), { mode: 'playing', voices: 1, diagnostics: [] });
  controller.dispose();
});
