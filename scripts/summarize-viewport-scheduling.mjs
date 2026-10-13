// Author: MiYu. Compare completed frame intervals and request gaps from native QA captures.
import fs from 'node:fs';
import path from 'node:path';
const [before, after, output] = process.argv.slice(2);
if (!before || !after) throw Error('Usage: node scripts/summarize-viewport-scheduling.mjs <before-root> <after-root> [output.json]');
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0 };
  return { n: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)] };
}
function summarize(root) {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'report.json')));
  return { root, passed: report.passed, pixelOracle: report.pixelOracle, shutdown: report.shutdown, stages: report.stages.map(stage => {
    const frames = JSON.parse(fs.readFileSync(path.join(root, stage.name + '-frames.json')));
    const views = {};
    for (const source of ['game', 'scene']) {
      const profiles = frames.profiles.filter(p => p.source === source);
      const gaps = profiles.slice(1).map((profile, index) => profile.timestamp - profile.transportMs - profiles[index].timestamp);
      const shared = key => stats(profiles.map(p => p.sharedTransport?.[key]));
      views[source] = { ...stage.sources[source], requestGapEstimateMs: stats(gaps),
        publicationReadyToEventMs: shared('publicationReadyToEventMs'), sharedRequestMs: shared('requestElapsedMs'),
        poolHits: profiles.filter(p => p.sharedTransport?.poolHit).length, frames: profiles.length };
    }
    const timers = (frames.timerCallbacks ?? []).map((callback, id) => {
      const scheduled = frames.timers.filter(timer => timer.id === id), fired = scheduled.filter(timer => Number.isFinite(timer.fire));
      return { callback, scheduled: scheduled.length, fired: fired.length, requestedMs: stats(scheduled.map(t => t.delay)), elapsedMs: stats(fired.map(t => t.fire - t.start)) };
    }).filter(timer => timer.scheduled);
    return { name: stage.name, raf: stage.raf, longTaskMs: stage.longTaskMs, views, timers };
  }) };
}
const json = JSON.stringify({ before: summarize(before), after: summarize(after) }, null, 2);
if (output) fs.writeFileSync(output, json + '\n');
else console.log(json);
