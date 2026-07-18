import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAssetPathsDirty,
  parseAlwaysIncludeDraft,
} from '../src/buildSettingsModel.ts';

test('Always Include drafts normalize whitespace without hiding ordering or duplicates', () => {
  assert.deepEqual(
    parseAlwaysIncludeDraft('  Assets/Dynamic  \r\n\n Assets/Localization\nAssets/Dynamic '),
    ['Assets/Dynamic', 'Assets/Localization', 'Assets/Dynamic'],
  );
});

test('Build asset path dirty state compares the exact persisted normalized list', () => {
  const saved = ['Assets/Dynamic', 'Assets/Localization'];
  assert.equal(
    buildAssetPathsDirty(' Assets/Dynamic\nAssets/Localization\n', saved),
    false,
  );
  assert.equal(
    buildAssetPathsDirty('Assets/Localization\nAssets/Dynamic', saved),
    true,
  );
  assert.equal(buildAssetPathsDirty('', saved), true);
});
