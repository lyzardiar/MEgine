import type { TimelineAsset } from './timelineAsset.ts';

export type TimelineDependencyEdgeStatus = 'loaded' | 'missing' | 'cycle' | 'depth-limit';

export interface TimelineDependencyNode {
  path: string;
  name: string;
  depth: number;
  duration: number;
  tracks: number;
  items: number;
}

export interface TimelineDependencyEdge {
  parentPath: string;
  childPath: string;
  trackId: string;
  trackName: string;
  clipIndex: number;
  depth: number;
  status: TimelineDependencyEdgeStatus;
}

export interface TimelineDependencyProfile {
  rootPath: string;
  nodes: TimelineDependencyNode[];
  edges: TimelineDependencyEdge[];
  totalTracks: number;
  totalItems: number;
  maximumDepth: number;
  missingAssets: number;
  cycles: number;
  depthLimited: number;
  truncated: boolean;
}

function normalizePath(path: string): string {
  return path.trim().replaceAll('\\', '/');
}

function pathKey(path: string): string {
  return normalizePath(path).toLowerCase();
}

function assetItemCount(asset: TimelineAsset): number {
  return asset.tracks.reduce((count, track) => (
    count + (track.type === 'signal' ? track.markers.length : track.clips.length)
  ), 0);
}

export function timelineDependencyProfile(
  root: TimelineAsset,
  rootPath: string,
  assets: ReadonlyMap<string, TimelineAsset>,
  maximumAssets = 256,
  maximumDepth = 8,
): TimelineDependencyProfile {
  const safeMaximumAssets = Number.isFinite(maximumAssets)
    ? Math.max(1, Math.min(4_096, Math.trunc(maximumAssets)))
    : 256;
  const safeMaximumDepth = Number.isFinite(maximumDepth)
    ? Math.max(0, Math.min(32, Math.trunc(maximumDepth)))
    : 8;
  const normalizedRootPath = normalizePath(rootPath) || '<current Timeline>';
  const nodes = new Map<string, TimelineDependencyNode>();
  const edges: TimelineDependencyEdge[] = [];
  const expanded = new Set<string>();
  const edgeLimit = safeMaximumAssets * 8;
  let truncated = false;
  const rootKey = pathKey(normalizedRootPath);
  nodes.set(rootKey, {
    path: normalizedRootPath,
    name: root.name,
    depth: 0,
    duration: root.duration,
    tracks: root.tracks.length,
    items: assetItemCount(root),
  });
  const queue: Array<{ asset: TimelineAsset; path: string; key: string; depth: number }> = [{
    asset: root,
    path: normalizedRootPath,
    key: rootKey,
    depth: 0,
  }];

  // Breadth-first expansion makes every node and edge depth the shortest path
  // from the root, even when a shared dependency is first listed on a deeper branch.
  for (let cursor = 0; cursor < queue.length && edges.length < edgeLimit; cursor += 1) {
    const current = queue[cursor];
    if (expanded.has(current.key)) continue;
    expanded.add(current.key);
    for (const track of current.asset.tracks) {
      if (track.type !== 'control') continue;
      for (const [clipIndex, clip] of track.clips.entries()) {
        if (edges.length >= edgeLimit) {
          truncated = true;
          break;
        }
        const childPath = normalizePath(clip.timeline);
        const childKey = pathKey(childPath);
        const child = childKey ? assets.get(childKey) : null;
        const status: TimelineDependencyEdgeStatus = !child
          ? 'missing'
          : current.depth >= safeMaximumDepth
            ? 'depth-limit'
            : 'loaded';
        edges.push({
          parentPath: current.path,
          childPath: childPath || '<missing path>',
          trackId: track.id,
          trackName: track.name,
          clipIndex,
          depth: current.depth + 1,
          status,
        });
        if (edges.length >= edgeLimit) truncated = true;
        if (status !== 'loaded' || !child) continue;
        const existing = nodes.get(childKey);
        if (existing) continue;
        if (nodes.size >= safeMaximumAssets) {
          truncated = true;
          continue;
        }
        nodes.set(childKey, {
          path: childPath,
          name: child.name,
          depth: current.depth + 1,
          duration: child.duration,
          tracks: child.tracks.length,
          items: assetItemCount(child),
        });
        queue.push({
          asset: child,
          path: childPath,
          key: childKey,
          depth: current.depth + 1,
        });
      }
      if (edges.length >= edgeLimit) break;
    }
  }

  // Mark deterministic DFS back-edges after discovery. This reports the edge
  // that closes each reachable cycle without allowing a cycle to distort the
  // breadth-first depth calculation above.
  const outgoing = new Map<string, TimelineDependencyEdge[]>();
  for (const edge of edges) {
    if (edge.status === 'missing') continue;
    const parent = pathKey(edge.parentPath);
    const child = pathKey(edge.childPath);
    if (!nodes.has(parent) || !nodes.has(child)) continue;
    const list = outgoing.get(parent) ?? [];
    list.push(edge);
    outgoing.set(parent, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const markCycles = (key: string) => {
    visiting.add(key);
    for (const edge of outgoing.get(key) ?? []) {
      const child = pathKey(edge.childPath);
      if (visiting.has(child)) {
        edge.status = 'cycle';
        continue;
      }
      if (!visited.has(child)) markCycles(child);
    }
    visiting.delete(key);
    visited.add(key);
  };
  markCycles(rootKey);

  const orderedNodes = [...nodes.values()].sort((left, right) => (
    left.depth - right.depth || left.path.localeCompare(right.path)
  ));
  const orderedEdges = edges;
  return {
    rootPath: normalizedRootPath,
    nodes: orderedNodes,
    edges: orderedEdges,
    totalTracks: orderedNodes.reduce((count, node) => count + node.tracks, 0),
    totalItems: orderedNodes.reduce((count, node) => count + node.items, 0),
    maximumDepth: orderedNodes.reduce((depth, node) => Math.max(depth, node.depth), 0),
    missingAssets: orderedEdges.filter((edge) => edge.status === 'missing').length,
    cycles: orderedEdges.filter((edge) => edge.status === 'cycle').length,
    depthLimited: orderedEdges.filter((edge) => edge.status === 'depth-limit').length,
    truncated,
  };
}
