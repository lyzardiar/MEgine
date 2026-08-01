import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const {
  drawUiItems,
  hitTestUi,
  layoutUiOverlay,
  uiTransparentMeshCulled,
} = await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(() => server.close());

class FakeDocument {
  canvases = [];

  createElement(name) {
    assert.equal(name, 'canvas');
    const canvas = new FakeCanvas(this, `layer-${this.canvases.length}`);
    this.canvases.push(canvas);
    return canvas;
  }
}

class FakeCanvas {
  width = 100;
  height = 100;

  constructor(ownerDocument, name) {
    this.ownerDocument = ownerDocument;
    this.name = name;
    this.context = new FakeContext(this);
  }

  getContext(kind) {
    assert.equal(kind, '2d');
    return this.context;
  }
}

class FakeContext {
  operations = [];
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  filter = 'none';
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  lineJoin = 'miter';
  font = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  stack = [];

  constructor(canvas) { this.canvas = canvas; }
  save() {
    this.stack.push([this.globalAlpha, this.globalCompositeOperation]);
    this.operations.push(['save']);
  }
  restore() {
    const state = this.stack.pop();
    if (state) [this.globalAlpha, this.globalCompositeOperation] = state;
    this.operations.push(['restore']);
  }
  getTransform() { return {}; }
  setTransform(...args) { this.operations.push(['setTransform', ...args]); }
  clearRect(...args) { this.operations.push(['clearRect', ...args]); }
  fillRect(...args) { this.operations.push(['fillRect', ...args]); }
  strokeRect(...args) { this.operations.push(['strokeRect', ...args]); }
  drawImage(source, ...args) { this.operations.push(['drawImage', source.name, ...args]); }
  beginPath() { this.operations.push(['beginPath']); }
  rect(...args) { this.operations.push(['rect', ...args]); }
  clip() { this.operations.push(['clip']); }
  translate(...args) { this.operations.push(['translate', ...args]); }
  rotate(...args) { this.operations.push(['rotate', ...args]); }
  setLineDash(...args) { this.operations.push(['setLineDash', ...args]); }
  fillText(...args) { this.operations.push(['fillText', ...args]); }
  strokeText(...args) { this.operations.push(['strokeText', ...args]); }
  measureText(value) { return { width: String(value).length * 8 }; }
}

function imageItem(canvasRenderer, color = [1, 1, 1, 0]) {
  const entities = [
    {
      entity: 1,
      components: {
        Canvas: {},
        GraphicRaycaster: {},
        RectTransform: {},
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: { size_delta: [100, 100] },
        ...(canvasRenderer == null ? {} : { CanvasRenderer: canvasRenderer }),
        Image: { color, raycast_target: true },
      },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 100, h: 100 }, new Set());
  return { entities, item: items.find((candidate) => candidate.entity === 2), items };
}

test('CanvasRenderer defaults to culling fully transparent legacy Graphic geometry', () => {
  const { item, items } = imageItem(undefined);
  assert.ok(item);
  assert.equal(item.cullTransparentMesh, true);
  assert.equal(uiTransparentMeshCulled(item), true);
  assert.equal(
    hitTestUi(items, 50, 50)?.entity,
    2,
    'visual mesh culling must preserve Graphic raycasts',
  );
});

test('CanvasRenderer can retain a zero-alpha mesh and does not cull visible alpha', () => {
  const retained = imageItem({ cull_transparent_mesh: false }).item;
  assert.equal(retained.cullTransparentMesh, false);
  assert.equal(uiTransparentMeshCulled(retained), false);

  const visible = imageItem({ cull_transparent_mesh: true }, [1, 1, 1, 0.01]).item;
  assert.equal(uiTransparentMeshCulled(visible), false);
});

test('a Graphic effect that ignores source alpha keeps transparent geometry alive', () => {
  const { item } = imageItem({ cull_transparent_mesh: true });
  item.shadow = {
    color: [0, 0, 0, 0.5],
    distance: [1, 1],
    useGraphicAlpha: false,
  };
  assert.equal(uiTransparentMeshCulled(item), false);
  item.shadow.useGraphicAlpha = true;
  assert.equal(uiTransparentMeshCulled(item), true);
});

test('Canvas preview renders alpha-independent effects from an opaque geometry mask', () => {
  const { item } = imageItem({ cull_transparent_mesh: true });
  item.shadow = {
    color: [0, 0, 0, 0.5],
    distance: [2, 3],
    useGraphicAlpha: false,
  };
  const document = new FakeDocument();
  const canvas = new FakeCanvas(document, 'output');
  drawUiItems(canvas.context, [item], null, null);

  assert.equal(document.canvases.length, 1);
  assert.ok(document.canvases[0].context.operations.some((operation) => (
    operation[0] === 'fillRect'
  )));
  assert.deepEqual(
    canvas.context.operations.find((operation) => operation[0] === 'drawImage'),
    ['drawImage', 'layer-0', 2, 3],
  );
});

test('adding an authored Graphic creates and protects its CanvasRenderer dependency', async () => {
  const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
  const store = createEditorStore();
  const entity = store.createGameObject('Graphic Host', {
    Transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
  });
  assert.notEqual(entity, null);
  assert.equal(store.addComponent(entity, 'Image', { color: [1, 1, 1, 0] }), true);
  const authored = store.authoredEntities().find((candidate) => candidate.entity === entity);
  assert.deepEqual(authored.components.CanvasRenderer, { cull_transparent_mesh: true });
  assert.ok(authored.components.RectTransform);
  assert.equal(store.removeComponent(entity, 'CanvasRenderer'), false);
  assert.equal(store.undo(), true);
  const restored = store.authoredEntities().find((candidate) => candidate.entity === entity);
  assert.equal(restored.components.CanvasRenderer, undefined);
  assert.equal(restored.components.RectTransform, undefined);
  assert.equal(restored.components.Image, undefined);
});
