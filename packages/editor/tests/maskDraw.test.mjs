import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const { drawUiItems } = await server.ssrLoadModule('/src/ui/uiLayout.ts');
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
  filter = 'none';
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  lineJoin = 'miter';
  font = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  #composite = 'source-over';
  #stack = [];

  constructor(canvas) {
    this.canvas = canvas;
  }

  get globalCompositeOperation() {
    return this.#composite;
  }

  set globalCompositeOperation(value) {
    this.#composite = value;
    this.operations.push(['composite', value]);
  }

  save() {
    this.#stack.push([this.globalAlpha, this.#composite]);
    this.operations.push(['save']);
  }

  restore() {
    const state = this.#stack.pop();
    if (state) [this.globalAlpha, this.#composite] = state;
    this.operations.push(['restore']);
  }

  getTransform() { return {}; }
  setTransform() { this.operations.push(['transform']); }
  clearRect(...args) { this.operations.push(['clearRect', ...args]); }
  fillRect(...args) { this.operations.push(['fillRect', ...args]); }
  strokeRect(...args) { this.operations.push(['strokeRect', ...args]); }
  drawImage(source, ...args) { this.operations.push(['drawImage', source.name, ...args]); }
  beginPath() { this.operations.push(['beginPath']); }
  closePath() { this.operations.push(['closePath']); }
  moveTo(...args) { this.operations.push(['moveTo', ...args]); }
  lineTo(...args) { this.operations.push(['lineTo', ...args]); }
  rect(...args) { this.operations.push(['rect', ...args]); }
  clip() { this.operations.push(['clip']); }
  translate(...args) { this.operations.push(['translate', ...args]); }
  rotate(...args) { this.operations.push(['rotate', ...args]); }
  setLineDash(...args) { this.operations.push(['setLineDash', ...args]); }
  fillText(...args) { this.operations.push(['fillText', ...args]); }
  strokeText(...args) { this.operations.push(['strokeText', ...args]); }
  measureText(value) { return { width: String(value).length * 8 }; }
}

const base = {
  depth: 0,
  role: 'graphic',
  rotation: 0,
  pivot: [0.5, 0.5],
  opacity: 1,
  selected: false,
};

function imageMask(entity, maskStack, showGraphic) {
  return {
    ...base,
    entity,
    rect: { x: 0, y: 0, w: 50, h: 100 },
    mask: { showGraphic },
    maskStack,
    image: {
      color: [1, 1, 1, 1],
      sprite: 'white',
      imageType: 'Filled',
      preserveAspect: false,
      fillCenter: true,
      fillMethod: 'Horizontal',
      fillAmount: 0.5,
      fillClockwise: true,
      fillOrigin: 0,
      spritePixelScale: 1,
      border: [0, 0, 0, 0],
      displayBorder: [0, 0, 0, 0],
      sourceSize: [100, 100],
      raycastTarget: true,
    },
  };
}

test('Canvas preview multiplies nested real Graphic alpha without showing hidden masks', () => {
  const document = new FakeDocument();
  const canvas = new FakeCanvas(document, 'output');
  const outer = imageMask(1, [], false);
  const inner = imageMask(2, [1], false);
  const child = {
    ...base,
    entity: 3,
    depth: 2,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    maskStack: [1, 2],
    panel: {
      color: [1, 0, 0, 1],
      borderColor: [0, 0, 0, 0],
      borderWidth: 0,
      raycastTarget: true,
    },
  };

  drawUiItems(canvas.context, [outer, inner, child], null, null);

  assert.equal(
    canvas.context.operations.filter(([operation]) => operation === 'fillRect').length,
    0,
    'hidden Mask Graphics must not paint directly into the viewport',
  );
  assert.equal(
    canvas.context.operations.filter(([operation]) => operation === 'drawImage').length,
    1,
    'only the final masked child layer is composited into the viewport',
  );
  const layerOperations = document.canvases.flatMap((layer) => layer.context.operations);
  assert.equal(
    layerOperations.filter((operation) => (
      operation[0] === 'composite' && operation[1] === 'destination-in'
    )).length,
    2,
    'each nested Mask multiplies the child layer alpha once',
  );
  assert.ok(
    layerOperations.some(([operation]) => operation === 'lineTo'),
    'Filled Mask geometry is traced rather than replaced by a rectangular scissor',
  );
});
