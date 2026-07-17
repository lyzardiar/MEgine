import type { Behaviour } from './Behaviour.js';
import type {
  BehaviourCtor,
  BehaviourEntry,
  FieldMeta,
  FieldType,
  MethodMeta,
} from './types.js';

const registry = new Map<string, BehaviourEntry>();

/** Pending field patches keyed by constructor, then field name. */
const pendingFields = new WeakMap<object, Map<string, Partial<FieldMeta>>>();
const pendingMethods = new WeakMap<object, Map<string, Partial<MethodMeta>>>();
const pendingClass = new WeakMap<
  object,
  { requires?: string[]; disallowMultiple?: boolean }
>();
/** Stable declaration order counters */
const fieldOrderSeq = new WeakMap<object, number>();

function ensureFieldPending(ctor: object): Map<string, Partial<FieldMeta>> {
  let m = pendingFields.get(ctor);
  if (!m) {
    m = new Map();
    pendingFields.set(ctor, m);
  }
  return m;
}

function ensureMethodPending(ctor: object): Map<string, Partial<MethodMeta>> {
  let m = pendingMethods.get(ctor);
  if (!m) {
    m = new Map();
    pendingMethods.set(ctor, m);
  }
  return m;
}

export function patchField(proto: object, key: string, patch: Partial<FieldMeta>) {
  const ctor = (proto as { constructor: object }).constructor;
  const m = ensureFieldPending(ctor);
  const prev = m.get(key) ?? { key, serialize: true };
  if (prev.order == null && patch.order == null) {
    const seq = fieldOrderSeq.get(ctor) ?? 0;
    fieldOrderSeq.set(ctor, seq + 1);
    patch = { ...patch, order: seq };
  }
  m.set(key, { ...prev, ...patch, key });
}

export function patchMethod(proto: object, key: string, patch: Partial<MethodMeta>) {
  const ctor = (proto as { constructor: object }).constructor;
  const m = ensureMethodPending(ctor);
  const prev = m.get(key) ?? { key };
  m.set(key, { ...prev, ...patch, key });
}

export function patchClassMeta(
  ctor: object,
  patch: { requires?: string[]; disallowMultiple?: boolean },
) {
  const prev = pendingClass.get(ctor) ?? {};
  pendingClass.set(ctor, {
    requires: patch.requires
      ? [...(prev.requires ?? []), ...patch.requires]
      : prev.requires,
    disallowMultiple: patch.disallowMultiple ?? prev.disallowMultiple,
  });
  // If already registered, patch live entry
  const typeName = (ctor as BehaviourCtor).typeName;
  if (typeName && registry.has(typeName)) {
    const entry = registry.get(typeName)!;
    if (patch.requires) {
      entry.requires = [...new Set([...entry.requires, ...patch.requires])];
    }
    if (patch.disallowMultiple) entry.disallowMultiple = true;
  }
}

function inferType(value: unknown): FieldType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value) && value.every((x) => typeof x === 'number')) {
    if (value.length === 3) return 'vec3';
    if (value.length === 4) return 'color';
  }
  return 'string';
}

function cloneDefault(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return structuredClone(value);
  return value;
}

export function registerBehaviourEntry(entry: BehaviourEntry) {
  registry.set(entry.type, entry);
}

export function getBehaviour(type: string): BehaviourEntry | undefined {
  return registry.get(type);
}

export function listBehaviours(): BehaviourEntry[] {
  return [...registry.values()];
}

export function isBehaviourType(type: string): boolean {
  return registry.has(type);
}

export function buildDefaults(ctor: BehaviourCtor, fields: FieldMeta[]): Record<string, unknown> {
  const sample = new ctor() as Behaviour & Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.serialize) continue;
    out[f.key] = cloneDefault(sample[f.key]);
  }
  return out;
}

/** Finalize pending field meta using an instance for type/default inference. */
export function finalizeFields(ctor: BehaviourCtor): FieldMeta[] {
  const m = pendingFields.get(ctor) ?? new Map();
  const sample = new ctor() as Behaviour & Record<string, unknown>;
  const fields: FieldMeta[] = [];
  for (const [key, patch] of m) {
    const value = sample[key];
    const type = patch.type ?? inferType(value);
    fields.push({
      key,
      type,
      serialize: patch.serialize !== false,
      label: patch.label,
      tooltip: patch.tooltip,
      range: patch.range,
      min: patch.min,
      max: patch.max,
      multiline: patch.multiline,
      textAreaMinLines: patch.textAreaMinLines,
      textAreaMaxLines: patch.textAreaMaxLines,
      multilineLines: patch.multilineLines,
      enumOptions: patch.enumOptions,
      assetKinds: patch.assetKinds,
      referenceType: patch.referenceType,
      allowNone: patch.allowNone,
      hideInInspector: patch.hideInInspector,
      order: patch.order,
      spaceBefore: patch.spaceBefore,
      readOnly: patch.readOnly,
      suffix: patch.suffix,
      title: patch.title,
      header: patch.header,
      infoBox: patch.infoBox,
      required: patch.required,
      toggleLeft: patch.toggleLeft,
      progressBar: patch.progressBar,
      showIf: patch.showIf,
      hideIf: patch.hideIf,
      enableIf: patch.enableIf,
      disableIf: patch.disableIf,
      boxGroup: patch.boxGroup,
      foldoutGroup: patch.foldoutGroup,
      horizontalGroup: patch.horizontalGroup,
      onValueChanged: patch.onValueChanged,
    });
  }
  fields.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return fields;
}

export function finalizeMethods(ctor: BehaviourCtor): MethodMeta[] {
  const m = pendingMethods.get(ctor) ?? new Map();
  const methods: MethodMeta[] = [];
  for (const [key, patch] of m) {
    methods.push({
      key,
      label: patch.label ?? key,
      button: patch.button,
      buttonGroup: patch.buttonGroup,
      contextMenu: patch.contextMenu,
    });
  }
  return methods;
}

export function takeClassMeta(ctor: BehaviourCtor): {
  requires: string[];
  disallowMultiple: boolean;
} {
  const m = pendingClass.get(ctor) ?? {};
  return {
    requires: [...new Set(m.requires ?? [])],
    disallowMultiple: !!m.disallowMultiple,
  };
}

export function clearRegistryForTests() {
  registry.clear();
}
