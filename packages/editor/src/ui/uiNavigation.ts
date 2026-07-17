import type { UiDrawItem } from './uiLayout';

export type UiNavigationAction =
  | { kind: 'click'; callback: unknown }
  | { kind: 'focus-input' }
  | {
      kind: 'value';
      component: 'Toggle' | 'Slider' | 'Scrollbar' | 'Dropdown' | 'ListView' | 'TabView';
      patch: Record<string, unknown>;
      callback: unknown;
    };

export function isUiSelectable(item: UiDrawItem): boolean {
  return !!(
    item.button?.interactable
    || item.toggle?.interactable
    || item.slider?.interactable
    || item.scrollbar?.interactable
    || item.input?.interactable
    || item.dropdown?.interactable
    || item.list?.interactable
    || item.tabs?.interactable
  );
}

export function nextUiSelectable(
  items: UiDrawItem[],
  current: number | null,
  reverse = false,
): number | null {
  const ids = items.filter(isUiSelectable).map((item) => item.entity);
  if (!ids.length) return null;
  const currentIndex = current == null ? -1 : ids.indexOf(current);
  if (currentIndex < 0) return reverse ? ids[ids.length - 1] : ids[0];
  const step = reverse ? -1 : 1;
  return ids[(currentIndex + step + ids.length) % ids.length];
}

function rangeDirectionDelta(direction: string, key: string): number {
  if (direction === 'LeftToRight') return key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (direction === 'RightToLeft') return key === 'ArrowLeft' ? 1 : key === 'ArrowRight' ? -1 : 0;
  if (direction === 'BottomToTop') return key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0;
  if (direction === 'TopToBottom') return key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
  return 0;
}

export function uiNavigationAction(item: UiDrawItem, key: string): UiNavigationAction | null {
  const activate = key === 'Enter' || key === ' ';
  if (item.button?.interactable && activate) {
    return { kind: 'click', callback: item.button.onClick };
  }
  if (item.toggle?.interactable && activate) {
    return {
      kind: 'value',
      component: 'Toggle',
      patch: { is_on: !item.toggle.isOn },
      callback: item.toggle.onValueChanged,
    };
  }
  if (item.input?.interactable && activate) return { kind: 'focus-input' };

  if (item.slider?.interactable) {
    const sign = rangeDirectionDelta(item.slider.direction, key);
    if (sign) {
      const low = Math.min(item.slider.min, item.slider.max);
      const high = Math.max(item.slider.min, item.slider.max);
      const step = item.slider.wholeNumbers ? 1 : Math.max((high - low) * 0.05, 0.0001);
      let value = Math.max(low, Math.min(high, item.slider.value + sign * step));
      if (item.slider.wholeNumbers) value = Math.round(value);
      return {
        kind: 'value',
        component: 'Slider',
        patch: { value },
        callback: item.slider.onValueChanged,
      };
    }
  }
  if (item.scrollbar?.interactable) {
    const sign = rangeDirectionDelta(item.scrollbar.direction, key);
    if (sign) {
      const step = item.scrollbar.numberOfSteps > 1
        ? 1 / (item.scrollbar.numberOfSteps - 1)
        : 0.1;
      return {
        kind: 'value',
        component: 'Scrollbar',
        patch: { value: Math.max(0, Math.min(1, item.scrollbar.value + sign * step)) },
        callback: item.scrollbar.onValueChanged,
      };
    }
  }
  if (item.dropdown?.interactable && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const count = item.dropdown.options.length;
    if (!count) return null;
    const index = Math.max(
      0,
      Math.min(count - 1, item.dropdown.selectedIndex + (key === 'ArrowDown' ? 1 : -1)),
    );
    return {
      kind: 'value',
      component: 'Dropdown',
      patch: { selected_index: index },
      callback: item.dropdown.onValueChanged,
    };
  }
  if (item.dropdown?.interactable && activate) {
    return {
      kind: 'value',
      component: 'Dropdown',
      patch: { expanded: !item.dropdown.expanded },
      callback: null,
    };
  }
  if (item.list?.interactable && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const count = item.list.items.length;
    if (!count) return null;
    const base = item.list.selectedIndex < 0 ? 0 : item.list.selectedIndex;
    const index = Math.max(0, Math.min(count - 1, base + (key === 'ArrowDown' ? 1 : -1)));
    return {
      kind: 'value',
      component: 'ListView',
      patch: { selected_index: index },
      callback: item.list.onValueChanged,
    };
  }
  if (item.tabs?.interactable && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    const count = item.tabs.labels.length;
    if (!count) return null;
    const index = Math.max(
      0,
      Math.min(count - 1, item.tabs.selectedIndex + (key === 'ArrowRight' ? 1 : -1)),
    );
    return {
      kind: 'value',
      component: 'TabView',
      patch: { selected_index: index },
      callback: item.tabs.onValueChanged,
    };
  }
  return null;
}
