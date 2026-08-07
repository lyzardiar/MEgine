import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const inspector = readFileSync(new URL('../src/panels/Inspector.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('Inspector booleans keep a visible Unity-style checkbox box', () => {
  const rule = styles.match(
    /\.field-row input\[type='checkbox'\],[\s\S]*?\.field-row \.field-bool \{([\s\S]*?)\}/,
  );
  assert.ok(rule, 'Inspector checkbox rule must exist');
  assert.match(rule[1], /width:\s*13px;/);
  assert.match(rule[1], /height:\s*13px;/);
});

test('component menus escape Inspector clipping and flip above the viewport edge', () => {
  assert.match(inspector, /import \{ createPortal \} from 'react-dom';/);
  assert.match(inspector, /below \+ menu\.height <= window\.innerHeight/);
  assert.match(inspector, /anchor\.top - menu\.height/);
  assert.match(inspector, /createPortal\([\s\S]*?className="comp-context-menu"[\s\S]*?document\.body/);
  assert.match(styles, /\.comp-context-menu \{\s+position:\s*fixed;/);
});
