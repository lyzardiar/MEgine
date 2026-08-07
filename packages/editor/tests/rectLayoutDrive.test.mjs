import assert from 'node:assert/strict';
import test from 'node:test';
import { rectLayoutDrive } from '../src/ui/rectLayoutDrive.ts';

test('RectTransform fields report the layout component that drives each axis', () => {
  assert.deepEqual(
    rectLayoutDrive(
      { components: {} },
      { name: 'Inventory', components: { LayoutGroup: { direction: 'Vertical' } } },
    ),
    {
      horizontal: 'Inventory Layout Group',
      vertical: 'Inventory Layout Group',
    },
  );
  assert.deepEqual(rectLayoutDrive({
    components: {
      ContentSizeFitter: {
        horizontal_fit: 'PreferredSize',
        vertical_fit: 'Unconstrained',
      },
      AspectRatioFitter: { aspect_mode: 'WidthControlsHeight' },
    },
  }), {
    horizontal: 'Content Size Fitter',
    vertical: 'Aspect Ratio Fitter',
  });
});
