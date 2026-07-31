import type { ButtonVisualState } from './buttonColorTint';

export type ButtonSpriteState = {
  highlighted: string;
  pressed: string;
  selected: string;
  disabled: string;
};

function spriteReference(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readButtonSpriteState(value: Record<string, unknown>): ButtonSpriteState {
  return {
    highlighted: spriteReference(value.highlighted_sprite ?? value.highlightedSprite),
    pressed: spriteReference(value.pressed_sprite ?? value.pressedSprite),
    selected: spriteReference(value.selected_sprite ?? value.selectedSprite),
    disabled: spriteReference(value.disabled_sprite ?? value.disabledSprite),
  };
}

/** Unity restores Image.sprite for Normal and for an unassigned SpriteState entry. */
export function buttonTargetSprite(
  authoredSprite: string,
  state: ButtonVisualState,
  sprites: ButtonSpriteState,
): string {
  if (state === 'Normal') return authoredSprite;
  const override = sprites[state.toLowerCase() as Lowercase<Exclude<ButtonVisualState, 'Normal'>>];
  return override || authoredSprite;
}
