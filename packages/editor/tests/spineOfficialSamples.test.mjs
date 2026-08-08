import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-canvas';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sampleRoot = join(repositoryRoot, 'samples', 'spine-showcase');
const assetRoot = join(sampleRoot, 'Assets', 'Spine');
const expectedExamples = [
  '1-weight-and-mass',
  '2-the-12-principles',
  '3-timing-and-spacing',
  '4-wave-principle',
  '5-squash-and-stretch',
  '6-arcs',
  '8-follow-through',
  'alien',
  'celestial-circus',
  'chibi-stickers',
  'cloud-pot',
  'coin',
  'diamond',
  'food-app',
  'goblins',
  'mix-and-match',
  'owl',
  'powerup',
  'raptor',
  'snowglobe',
  'speedy',
  'spineboy',
  'spinosaurus',
  'stretchyman',
  'tank',
  'vine',
  'windmill',
];

function readSkeleton(skeletonPath, atlasPath) {
  const atlas = new TextureAtlas(readFileSync(atlasPath, 'utf8'));
  const loader = new AtlasAttachmentLoader(atlas);
  if (skeletonPath.endsWith('.json')) {
    return new SkeletonJson(loader).readSkeletonData(
      JSON.parse(readFileSync(skeletonPath, 'utf8')),
    );
  }
  return new SkeletonBinary(loader).readSkeletonData(
    Uint8Array.from(readFileSync(skeletonPath)),
  );
}

test('official Spine showcase contains only licensed, loadable 4.3 exports', () => {
  const examples = readdirSync(assetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(examples, [...expectedExamples].sort());
  assert.equal(existsSync(join(sampleRoot, 'SPINE_RUNTIMES_LICENSE.txt')), true);

  let skeletonCount = 0;
  for (const example of examples) {
    const directory = join(assetRoot, example);
    const files = readdirSync(directory);
    assert.equal(existsSync(join(directory, 'LICENSE.txt')), true, `${example} license`);

    const atlasFiles = files.filter((file) => file.endsWith('.atlas'));
    assert.ok(atlasFiles.length > 0, `${example} has an atlas`);
    for (const atlasFile of atlasFiles) {
      const atlas = new TextureAtlas(readFileSync(join(directory, atlasFile), 'utf8'));
      for (const page of atlas.pages) {
        assert.equal(existsSync(join(directory, page.name)), true, `${example}/${page.name}`);
      }
    }

    const preferredAtlases = [
      ...atlasFiles.filter((file) => !file.includes('-pma')),
      ...atlasFiles.filter((file) => file.includes('-pma')),
    ];
    for (const skeletonFile of files.filter(
      (file) => file.endsWith('.json') || file.endsWith('.skel'),
    )) {
      skeletonCount += 1;
      let skeletonData;
      let lastError;
      for (const atlasFile of preferredAtlases) {
        try {
          skeletonData = readSkeleton(join(directory, skeletonFile), join(directory, atlasFile));
          break;
        } catch (error) {
          lastError = error;
        }
      }
      assert.ok(skeletonData, `${example}/${skeletonFile}: ${lastError?.message}`);
      assert.match(skeletonData.version, /^4\.3\./, `${example}/${skeletonFile}`);
    }
  }
  assert.equal(skeletonCount, 80);
});

test('Spine showcase includes a Canvas-hosted UI example', () => {
  const scene = JSON.parse(readFileSync(join(sampleRoot, 'Assets', 'Scenes', 'UI.mscene'), 'utf8'));
  const canvas = scene.world.entities.find((entity) => entity.components.Canvas);
  const spine = scene.world.entities.find((entity) => entity.components.SpineSkeleton);

  assert.equal(canvas.components.Canvas.render_mode, 'ScreenSpaceOverlay');
  assert.equal(spine.parent, canvas.entity);
  assert.deepEqual(spine.components.RectTransform.size_delta, [360, 420]);
  assert.equal(spine.components.SpineSkeleton.skeleton, 'Assets/Spine/spineboy/spineboy-pro.json');
  assert.equal(spine.components.SpineSkeleton.atlas, 'Assets/Spine/spineboy/spineboy-pma.atlas');
});
