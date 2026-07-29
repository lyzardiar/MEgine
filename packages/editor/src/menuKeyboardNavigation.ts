export type MenuListNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function nextMenuItemIndex(
  count: number,
  currentIndex: number,
  key: MenuListNavigationKey,
): number {
  if (!Number.isInteger(count) || count <= 0) return -1;
  const current = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < count
    ? currentIndex
    : -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % count;
  return current < 0 ? count - 1 : (current - 1 + count) % count;
}

export function directEnabledMenuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
    (item) => (
      item.closest('[role="menu"]') === menu
      && item.getAttribute('aria-disabled') !== 'true'
      && !item.matches(':disabled')
    ),
  );
}

export function focusMenuBoundary(
  menu: HTMLElement | null,
  boundary: 'first' | 'last',
): boolean {
  if (!menu) return false;
  const items = directEnabledMenuItems(menu);
  const item = boundary === 'first' ? items[0] : items[items.length - 1];
  if (!item) return false;
  item.focus({ preventScroll: true });
  return true;
}

export function moveMenuItemFocus(
  menu: HTMLElement,
  target: EventTarget | null,
  key: string,
): boolean {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return false;
  const items = directEnabledMenuItems(menu);
  const currentItem = target instanceof Element
    ? target.closest<HTMLElement>('[role="menuitem"]')
    : null;
  const nextIndex = nextMenuItemIndex(
    items.length,
    currentItem ? items.indexOf(currentItem) : -1,
    key as MenuListNavigationKey,
  );
  const next = items[nextIndex];
  if (!next) return false;
  next.focus({ preventScroll: true });
  return true;
}
