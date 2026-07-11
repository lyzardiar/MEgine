/**
 * Spinning Cube — TypeScript game script (compiled to main.js for runtime).
 * Author in TS; Boa host executes the emitted JS.
 */

let t = 0;

function onTick(dt: number, _frame: number): void {
  t += dt;

  const r = 0.12 + 0.08 * Math.sin(t);
  const g = 0.1 + 0.05 * Math.cos(t * 0.9);
  engine.setClearColor(r, g, 0.16, 1.0);
}
