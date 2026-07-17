/** Ping Hierarchy / Project assets (Unity-style). */

export type PingEntity = { kind: 'entity'; id: number };
export type PingAsset = {
  kind: 'asset';
  assetId: string;
  /** Kept for callers that specifically need sprite semantics. */
  spriteId?: string;
  folder?: string;
};
export type PingEvent = PingEntity | PingAsset;

type Listener = (e: PingEvent) => void;

const _listeners = new Set<Listener>();

export function subscribePing(fn: Listener): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

export function pingEntity(id: number) {
  const e: PingEntity = { kind: 'entity', id };
  for (const fn of _listeners) fn(e);
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'hierarchy' }));
}

export function pingSprite(spriteId: string, folder?: string) {
  const e: PingAsset = { kind: 'asset', assetId: spriteId, spriteId, folder };
  for (const fn of _listeners) fn(e);
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'project' }));
}

export function pingProjectAsset(assetId: string, folder?: string) {
  const e: PingAsset = { kind: 'asset', assetId, folder };
  for (const fn of _listeners) fn(e);
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'project' }));
}
