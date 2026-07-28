export interface AgentPage<T> {
  total: number;
  offset: number;
  count: number;
  nextOffset: number | null;
  hasMore: boolean;
  truncated: boolean;
  items: T[];
}

/** Create one deterministic offset page while retaining both-side truncation. */
export function paginateAgentItems<T>(
  source: readonly T[],
  offset: number,
  limit: number,
): AgentPage<T> {
  const items = source.slice(offset, offset + limit);
  const hasMore = offset + items.length < source.length;
  return {
    total: source.length,
    offset,
    count: items.length,
    nextOffset: hasMore ? offset + items.length : null,
    hasMore,
    truncated: offset > 0 || hasMore,
    items,
  };
}
