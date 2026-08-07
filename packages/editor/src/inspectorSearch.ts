const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();

export function fuzzyInspectorMatch(value: string, query: string): boolean {
  const haystack = normalize(value);
  const needle = normalize(query);
  if (!needle || haystack.includes(needle)) return true;
  let cursor = 0;
  let firstMatch = -1;
  for (let index = 0; index < haystack.length; index += 1) {
    if (haystack[index] !== needle[cursor]) continue;
    if (firstMatch < 0) firstMatch = index;
    cursor += 1;
    if (cursor === needle.length) {
      return index - firstMatch + 1 <= Math.max(needle.length * 2, needle.length + 3);
    }
  }
  return false;
}

export function inspectorSectionMatches(
  query: string,
  title: string,
  searchText = '',
): boolean {
  const searchable = `${title} ${searchText}`;
  return query.trim().split(/\s+/).filter(Boolean)
    .every((token) => fuzzyInspectorMatch(searchable, token));
}

export function componentCatalogMatches(
  query: string,
  component: { type: string; label: string; description?: string },
): boolean {
  const searchable = `${component.label} ${component.type} ${component.description ?? ''}`;
  const acronym = [component.type, component.label]
    .map((value) => (value.match(/[A-Z0-9]/g) ?? []).join(''))
    .join(' ');
  return query.trim().split(/\s+/).filter(Boolean)
    .every((token) => fuzzyInspectorMatch(searchable, token) || fuzzyInspectorMatch(acronym, token));
}
