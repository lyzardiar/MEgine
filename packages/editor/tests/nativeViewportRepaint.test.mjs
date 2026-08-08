import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viewport = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8');
const agentBridge = readFileSync(new URL('../src/agent/AgentBridge.ts', import.meta.url), 'utf8');

test('decoded native frames cross a task boundary when hidden WebViews suspend animation frames', () => {
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
    const deferred = completion.indexOf('if (firstFrame) window.setTimeout(paint, 0);');
    assert.notEqual(completed, -1, `${frameRef} must mark the request successful`);
    assert.ok(repainted > completed, `${frameRef} must repaint after committing the frame`);
    assert.ok(deferred > repainted, `${frameRef} must defer one first-frame repaint for WebView composition`);
  }
  assert.match(
    viewport,
    /React still commits[\s\S]*useEffect\(\(\) => \{\s+paint\(\);[\s\S]*props\.entities/,
  );
  assert.match(
    viewport,
    /const trailingPaint = window\.setTimeout\(paint, 550\);\s+return \(\) => window\.clearTimeout\(trailingPaint\);/,
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

test('native Game frames remain behind JS-backed world Spine and Canvas renderers', () => {
  assert.match(
    viewport,
    /if \(renderKind === 'spine'\)[\s\S]*?if \(isGame && '__TAURI_INTERNALS__' in window\) continue;/,
  );
  assert.match(
    viewport,
    /ctx\.drawImage\(nativeFrame\.image, vp\.x, vp\.y, vp\.w, vp\.h\);[\s\S]*?renderKind !== 'spine'[\s\S]*?spineRuntimeRef\.current\?\.drawEntity\([\s\S]*?drawUiItems\(/,
  );
});
