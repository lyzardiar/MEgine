import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rust = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'agent_bridge.rs'), 'utf8');
const protocol = fs.readFileSync(path.join(root, 'src', 'agent', 'protocol.ts'), 'utf8');
const mcp = fs.readFileSync(path.join(root, '..', 'agent', 'mcp', 'server.mjs'), 'utf8');

test('semantic interactions tolerate unrelated live values without weakening target guards', () => {
  assert.match(rust, /const interactionSignatureFor = \(semanticElement\) =>/);
  assert.match(rust, /delete state\.focused/);
  assert.match(rust, /rect: undefined,\s*scroll: undefined/);
  assert.match(rust, /signature: interactionSignatureFor\(semanticElement\)/);
  assert.match(rust, /revisionGuard\.latestRevision = snapshotRevision/);
  assert.match(rust, /const preActionSnapshot = \(/);
  assert.match(rust, /const pendingInteraction = \(/);
  assert.match(rust, /preActionSnapshotRevision: preActionSnapshot\.snapshotRevision/);
  assert.doesNotMatch(
    rust,
    /const invalidateRevisionGuard = \(\) => \{\s*revisionGuard\.epoch \+= 1;\s*revisionGuard\.revisions\.clear\(\);/,
  );
  assert.match(
    rust,
    /const guardedRevision = revisionGuard\?\.revisions\?\.get\(expectedSnapshotRevision\);\s*if \(!revisionGuard \|\| !guardedRevision\)/,
  );
  assert.match(
    rust,
    /currentGuardedElement\.element !== guardedElement\.element[\s\S]*currentGuardedElement\.signature !== guardedElement\.signature/,
  );
  assert.match(
    rust,
    /currentGuardedTarget\.element !== guardedTarget\.element[\s\S]*currentGuardedTarget\.signature !== guardedTarget\.signature/,
  );
  assert.equal(
    rust.match(/if actual_snapshot_revision != expected_snapshot_revision/g)?.length,
    2,
  );
  assert.match(rust, /"preSnapshotRevision"/);
  assert.match(rust, /"snapshotDriftedBeforeAction"/);
});

test('live semantic drift is explicit in the protocol and Agent guidance', () => {
  assert.match(protocol, /preSnapshotRevision\?: string/);
  assert.match(protocol, /snapshotDriftedBeforeAction\?: boolean/);
  assert.match(mcp, /unrelated live UI values change/);
  assert.match(mcp, /action-relevant semantic signature/);
  assert.match(mcp, /transient focus, geometry, and scroll telemetry are re-read at dispatch/);
});
