import { getBehaviour } from './registry.js';
import type { BehaviourEntry } from './types.js';
import type { Behaviour } from './Behaviour.js';

/** Edit-mode: spawn temp instance, call method, return updated field blob. */
export function invokeBehaviourMethodEdit(
  type: string,
  data: Record<string, unknown>,
  methodKey: string,
): Record<string, unknown> | null {
  const entry = getBehaviour(type);
  if (!entry) return null;
  const inst = new entry.ctor() as Behaviour & Record<string, unknown>;
  Object.assign(inst, structuredClone(data));
  const fn = inst[methodKey];
  if (typeof fn === 'function') {
    (fn as (this: Behaviour) => void).call(inst);
  }
  const out: Record<string, unknown> = { ...data };
  for (const f of entry.fields) {
    if (!f.serialize) continue;
    const v = inst[f.key];
    out[f.key] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}

export function collectSerializedBlob(
  entry: BehaviourEntry,
  inst: Behaviour & Record<string, unknown>,
): Record<string, unknown> {
  const blob: Record<string, unknown> = {};
  for (const f of entry.fields) {
    if (!f.serialize) continue;
    const v = inst[f.key];
    blob[f.key] = Array.isArray(v) ? [...v] : v;
  }
  return blob;
}
