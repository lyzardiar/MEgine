import assert from 'node:assert/strict';
import test from 'node:test';
import { diffProjectFiles } from '../src/projectAssets.ts';

function asset(relPath, revision, kind = 'material', guid = 'bf914747-8c6a-418f-b74f-49d49114f9a2') {
  const segments = relPath.split('/');
  return {
    id: relPath,
    guid,
    name: segments.at(-1),
    folder: segments.slice(0, -1).join('/'),
    relPath,
    kind,
    revision,
    size: 10,
    metaStatus: 'ready',
    metaError: null,
  };
}

test('project asset changes distinguish add modify and delete deterministically', () => {
  const previous = [
    asset('Assets/A.mmat', 'a1'),
    asset('Assets/B.mshader', 'b1', 'shader'),
    asset('Assets/Deleted.mmat', 'd1'),
  ];
  const current = [
    asset('Assets/A.mmat', 'a2'),
    asset('Assets/B.mshader', 'b1', 'shader'),
    asset('Assets/New.mmat', 'n1'),
  ];
  assert.deepEqual(
    diffProjectFiles(previous, current).map(({ type, relPath }) => [type, relPath]),
    [
      ['modified', 'Assets/A.mmat'],
      ['deleted', 'Assets/Deleted.mmat'],
      ['added', 'Assets/New.mmat'],
    ],
  );
});

test('asset metadata identity and health changes invalidate the project index', () => {
  const before = asset('Assets/Materials/Hero.mmat', 'same');
  const changedGuid = asset(
    'Assets/Materials/Hero.mmat',
    'same',
    'material',
    '55081cc1-f44d-49fc-8ada-ee889a26ee36',
  );
  assert.equal(diffProjectFiles([before], [changedGuid])[0]?.type, 'modified');

  const invalid = { ...before, guid: null, metaStatus: 'invalid', metaError: 'broken metadata' };
  assert.equal(diffProjectFiles([before], [invalid])[0]?.type, 'modified');
});

test('case-only path renames remain visible as a modification', () => {
  const changes = diffProjectFiles(
    [asset('Assets/Materials/hero.mmat', 'same')],
    [asset('Assets/Materials/Hero.mmat', 'same')],
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, 'modified');
  assert.equal(changes[0].relPath, 'Assets/Materials/Hero.mmat');
});
