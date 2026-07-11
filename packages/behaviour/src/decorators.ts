import {
  finalizeFields,
  finalizeMethods,
  patchField,
  patchMethod,
  patchClassMeta,
  registerBehaviourEntry,
  buildDefaults,
  takeClassMeta,
} from './registry.js';
import type { Behaviour } from './Behaviour.js';
import type { ComponentType } from './components.js';
import type {
  BehaviourCtor,
  EnumOption,
  FieldCondition,
  FieldType,
} from './types.js';

type Proto = object;

export type SerializeFieldOptions = {
  type?: FieldType;
};

function field(proto: Proto, key: string, patch: Parameters<typeof patchField>[2]) {
  patchField(proto, key, { serialize: true, ...patch });
}

/** Mark a field for scene serialization + Inspector. */
export function SerializeField(opts: SerializeFieldOptions = {}) {
  return (proto: Proto, key: string) => {
    field(proto, key, opts.type ? { type: opts.type } : {});
  };
}

export function HideInInspector() {
  return (proto: Proto, key: string) => {
    field(proto, key, { hideInInspector: true });
  };
}

export function ShowInInspector() {
  return (proto: Proto, key: string) => {
    field(proto, key, { hideInInspector: false, serialize: true });
  };
}

export function Label(text: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { label: text });
  };
}

/** Odin alias */
export const LabelText = Label;

export function Tooltip(text: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { tooltip: text });
  };
}

export function Range(min: number, max: number) {
  return (proto: Proto, key: string) => {
    field(proto, key, { range: [min, max], type: 'number' });
  };
}

/** Odin alias */
export const PropertyRange = Range;

export function Min(min: number) {
  return (proto: Proto, key: string) => {
    field(proto, key, { min, type: 'number' });
  };
}

export const MinValue = Min;

export function Max(max: number) {
  return (proto: Proto, key: string) => {
    field(proto, key, { max, type: 'number' });
  };
}

export const MaxValue = Max;

export function Multiline(lines?: number) {
  return (proto: Proto, key: string) => {
    field(proto, key, {
      multiline: true,
      type: 'string',
      multilineLines: lines,
    });
  };
}

export function TextArea(minLines = 3, maxLines = 10) {
  return (proto: Proto, key: string) => {
    field(proto, key, {
      multiline: true,
      type: 'string',
      textAreaMinLines: minLines,
      textAreaMaxLines: maxLines,
    });
  };
}

export function Enum(options: EnumOption[]) {
  return (proto: Proto, key: string) => {
    field(proto, key, { enumOptions: options, type: 'enum' });
  };
}

export const ValueDropdown = Enum;

export function Header(text: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { header: text });
  };
}

export function Title(text: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { title: text });
  };
}

export function InfoBox(text: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { infoBox: text });
  };
}

export function Space(px = 8) {
  return (proto: Proto, key: string) => {
    field(proto, key, { spaceBefore: px });
  };
}

export const PropertySpace = Space;

export function PropertyOrder(order: number) {
  return (proto: Proto, key: string) => {
    field(proto, key, { order });
  };
}

export function ReadOnly() {
  return (proto: Proto, key: string) => {
    field(proto, key, { readOnly: true });
  };
}

export function SuffixLabel(text: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { suffix: text });
  };
}

export function Required() {
  return (proto: Proto, key: string) => {
    field(proto, key, { required: true });
  };
}

export function ToggleLeft() {
  return (proto: Proto, key: string) => {
    field(proto, key, { toggleLeft: true, type: 'boolean' });
  };
}

export function ProgressBar() {
  return (proto: Proto, key: string) => {
    field(proto, key, { progressBar: true, type: 'number' });
  };
}

export function ShowIf(fieldName: string, equals: unknown) {
  return (proto: Proto, key: string) => {
    field(proto, key, { showIf: { field: fieldName, equals } satisfies FieldCondition });
  };
}

export function HideIf(fieldName: string, equals: unknown) {
  return (proto: Proto, key: string) => {
    field(proto, key, { hideIf: { field: fieldName, equals } satisfies FieldCondition });
  };
}

export function EnableIf(fieldName: string, equals: unknown) {
  return (proto: Proto, key: string) => {
    field(proto, key, { enableIf: { field: fieldName, equals } satisfies FieldCondition });
  };
}

export function DisableIf(fieldName: string, equals: unknown) {
  return (proto: Proto, key: string) => {
    field(proto, key, { disableIf: { field: fieldName, equals } satisfies FieldCondition });
  };
}

export function BoxGroup(name: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { boxGroup: name });
  };
}

export function FoldoutGroup(name: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { foldoutGroup: name });
  };
}

export function HorizontalGroup(name: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { horizontalGroup: name });
  };
}

export function OnValueChanged(methodName: string) {
  return (proto: Proto, key: string) => {
    field(proto, key, { onValueChanged: methodName });
  };
}

/* ── Method decorators ── */

export type ButtonOptions = { buttonGroup?: string };

export function Button(label?: string, opts: ButtonOptions = {}) {
  return (proto: Proto, key: string, _desc?: PropertyDescriptor) => {
    patchMethod(proto, key, {
      button: true,
      label: label ?? key,
      buttonGroup: opts.buttonGroup,
    });
  };
}

export function ButtonGroup(name: string) {
  return (proto: Proto, key: string, _desc?: PropertyDescriptor) => {
    patchMethod(proto, key, { button: true, buttonGroup: name });
  };
}

export function ContextMenu(name: string) {
  return (proto: Proto, key: string, _desc?: PropertyDescriptor) => {
    patchMethod(proto, key, { contextMenu: name, label: name });
  };
}

/* ── Class decorators ── */

type TypeToken = ComponentType | BehaviourCtor | { readonly typeName?: string; name?: string };

function typeTokenName(t: TypeToken): string {
  if ('typeName' in t && t.typeName) return t.typeName;
  return t.name ?? 'Unknown';
}

export function RequireComponent(...ctors: TypeToken[]) {
  return <T extends BehaviourCtor>(ctor: T): T => {
    patchClassMeta(ctor, { requires: ctors.map(typeTokenName) });
    return ctor;
  };
}

export function DisallowMultipleComponent<T extends BehaviourCtor>(ctor: T): T {
  patchClassMeta(ctor, { disallowMultiple: true });
  return ctor;
}

export type RegisterBehaviourOptions = {
  label?: string;
  description?: string;
};

/**
 * Register a Behaviour subclass under a component type name (scene JSON key).
 * Place closest to the class; put @RequireComponent / @DisallowMultipleComponent above it.
 */
export function RegisterBehaviour(typeName: string, opts: RegisterBehaviourOptions = {}) {
  return <T extends BehaviourCtor>(ctor: T): T => {
    const fields = finalizeFields(ctor);
    const methods = finalizeMethods(ctor);
    const classMeta = takeClassMeta(ctor);
    Object.defineProperty(ctor, 'typeName', {
      value: typeName,
      writable: false,
      configurable: true,
    });
    registerBehaviourEntry({
      type: typeName,
      label: opts.label ?? typeName,
      description: opts.description ?? '',
      ctor,
      fields,
      methods,
      defaults: () => buildDefaults(ctor, fields),
      requires: classMeta.requires,
      disallowMultiple: classMeta.disallowMultiple,
    });
    return ctor;
  };
}

/** Type helper for subclasses. */
export type BehaviourClass = typeof Behaviour;
