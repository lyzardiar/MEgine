import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viewport = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8');
const agentBridge = readFileSync(new URL('../src/agent/AgentBridge.ts', import.meta.url), 'utf8');

test('decoded native frames repaint immediately when hidden WebViews suspend animation frames', () => {
  for (const frameRef of [
    'nativeGameFrameRef.current',
    'nativeSceneFrameRef.current',
    'nativeCameraPreviewFrameRef.current',
  ]) {
    const assignment = viewport.indexOf(`${frameRef} = {`);
    assert.notEqual(assignment, -1, `${frameRef} assignment must exist`);
    const completion = viewport.slice(assignment, assignment + 500);
    const completed = completion.indexOf('request.reportedError = false;');
    const repainted = completion.indexOf('paint();');
    assert.notEqual(completed, -1, `${frameRef} must mark the request successful`);
    assert.ok(repainted > completed, `${frameRef} must repaint after committing the frame`);
  }
  assert.match(
    viewport,
    /React still commits[\s\S]*useEffect\(\(\) => \{\s+paint\(\);[\s\S]*props\.entities/,
  );
  assert.match(viewport, /NATIVE_CAPTURE_READY_TIMEOUT_MS = 8_000/);
  assert.match(agentBridge, /prepareMainViewportCapture\(windowLabel/);
  assert.match(agentBridge, /if \(this\.captures\.size === 0\)/);
  assert.match(agentBridge, /Canvas pixels are current now; yield once/);
  assert.match(
    agentBridge,
    /await this\.prepareMainViewportCapture\(windowLabel\);\s+return invoke<ScreenshotResult>/,
  );
});
