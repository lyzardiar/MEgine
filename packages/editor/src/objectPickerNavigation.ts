export type ObjectPickerNavigationKey =
  | 'ArrowDown'
  | 'ArrowUp'
  | 'Home'
  | 'End'
  | 'PageDown'
  | 'PageUp';

export function nextObjectPickerOptionIndex(
  count: number,
  currentIndex: number,
  key: ObjectPickerNavigationKey,
  pageSize = 10,
): number {
  if (!Number.isInteger(count) || count <= 0) return -1;
  const current = Number.isInteger(currentIndex)
    && currentIndex >= 0
    && currentIndex < count
    ? currentIndex
    : -1;
  const page = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % count;
  if (key === 'ArrowUp') return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === 'PageDown') return current < 0 ? 0 : Math.min(count - 1, current + page);
  return current < 0 ? count - 1 : Math.max(0, current - page);
}
