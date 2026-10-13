// Author: MiYu. Compare native viewport resource sampling with fixed-input QA captures.
import fs from 'node:fs';
import path from 'node:path';
const [before, after, output] = process.argv.slice(2);
if (!before || !after) throw Error('Usage: node scripts/summarize-viewport-resource-profile.mjs <before-root> <after-root> [output.json]');
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0 };
  return { n: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length, p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] };
}
function summarize(root) {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'report.json')));
  return { root, passed: report.passed, pixelOracle: report.pixelOracle, shutdown: report.shutdown, stages: report.stages.map(stage => {
    const frames = JSON.parse(fs.readFileSync(path.join(root, stage.name + '-frames.json')));
    const profiles = frames.allNative ?? [];
    const scopes = {};
    function visit(node) {
      if (!node) return;
      (scopes[node.name] ??= []).push(node.totalMs);
      for (const child of node.children ?? []) visit(child);
    }
    profiles.forEach(profile => visit(profile.callTree));
    return { name: stage.name, raf: stage.raf, game: stage.sources.game, nativeFrames: profiles.length,
      snapshot: stats(scopes['Profiler.snapshot'] ?? []), references: stats(scopes['Resources.references'] ?? []),
      synchronousMetadata: stats(scopes['Resources.metadata'] ?? []),
      metadataWorker: stats(profiles.map(p => p.resourceSampling?.metadataMs)),
      resourceAge: stats(profiles.map(p => p.resourceSampleAgeMs)),
      ready: profiles.filter(p => p.resourceSampling?.ready).length,
      pending: profiles.filter(p => p.resourceSampling?.pending).length,
      delayed: profiles.filter(p => p.resourceSampling?.delayed).length,
      unavailable: profiles.filter(p => p.resourceSampling?.unavailable).length };
  }) };
}
const result = { before: summarize(before), after: summarize(after) };
const json = JSON.stringify(result, null, 2);
if (output) fs.writeFileSync(output, json + '\n');
else console.log(json);
