import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createViewportSimulationClock,
  sampleViewportSimulationClock,
} from '../src/viewportSimulationClock.ts';

test('edit-mode viewport previews follow bounded wall-clock time', () => {
  const initial = createViewportSimulationClock(false, 0, 1_000);
  const first = sampleViewportSimulationClock(initial, false, 0, 1_050);
  assert.equal(first.deltaSeconds, 0.05);
  assert.equal(first.animationTimeSeconds, 1.05);

  const delayed = sampleViewportSimulationClock(first.state, false, 0, 2_050);
  assert.equal(delayed.deltaSeconds, 0.1);
  assert.equal(delayed.animationTimeSeconds, 2.05);
});

test('runtime viewport clock freezes while paused and advances exactly once on step', () => {
  const edit = createViewportSimulationClock(false, 0, 1_000);
  const enteredPlay = sampleViewportSimulationClock(edit, true, 0, 1_010);
  assert.equal(enteredPlay.deltaSeconds, 0);
  assert.equal(enteredPlay.animationTimeSeconds, 0);

  const playing = sampleViewportSimulationClock(enteredPlay.state, true, 1 / 60, 1_026);
  assert.equal(playing.deltaSeconds, 1 / 60);
  assert.equal(playing.animationTimeSeconds, 1 / 60);

  const paused = sampleViewportSimulationClock(playing.state, true, 1 / 60, 5_000);
  assert.equal(paused.deltaSeconds, 0);
  assert.equal(paused.animationTimeSeconds, 1 / 60);

  const stepped = sampleViewportSimulationClock(paused.state, true, 1 / 60 + 1 / 30, 6_000);
  assert.ok(Math.abs(stepped.deltaSeconds - 1 / 30) < Number.EPSILON);
  assert.equal(stepped.animationTimeSeconds, 1 / 60 + 1 / 30);

  const repeatedPaint = sampleViewportSimulationClock(stepped.state, true, 1 / 60 + 1 / 30, 7_000);
  assert.equal(repeatedPaint.deltaSeconds, 0);
  assert.equal(repeatedPaint.animationTimeSeconds, stepped.animationTimeSeconds);
});

test('runtime clock resets cleanly across stop and a new play session', () => {
  const running = createViewportSimulationClock(true, 12, 2_000);
  const stopped = sampleViewportSimulationClock(running, false, 0, 2_010);
  assert.equal(stopped.deltaSeconds, 0);

  const editPreview = sampleViewportSimulationClock(stopped.state, false, 0, 2_026);
  assert.equal(editPreview.deltaSeconds, 0.016);

  const restarted = sampleViewportSimulationClock(editPreview.state, true, 0, 2_030);
  assert.equal(restarted.deltaSeconds, 0);
  assert.equal(restarted.animationTimeSeconds, 0);
});
