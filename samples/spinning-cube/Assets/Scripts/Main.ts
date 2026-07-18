/**
 * Spinning Cube — standard project script compiled by PC Build for the Boa runtime.
 */

const cubeEntity = 3;
let elapsed = 0;

function onTick(dt: number, _frame: number): void {
  elapsed += dt;

  const halfAngle = elapsed * 0.5;
  engine.pushCommandJson(JSON.stringify({
    op: 'setComponent',
    entity: cubeEntity,
    component: 'Transform',
    value: {
      position: [0, 0, 0],
      rotation: [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
      scale: [1, 1, 1],
    },
  }));

  const r = 0.12 + 0.08 * Math.sin(elapsed);
  const g = 0.1 + 0.05 * Math.cos(elapsed * 0.9);
  engine.setClearColor(r, g, 0.16, 1.0);
}
