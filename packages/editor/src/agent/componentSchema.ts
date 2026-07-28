import {
  getBehaviour,
  type FieldMeta,
  type MethodMeta,
} from '@mengine/behaviour';
import {
  getComponentCatalog,
  type ComponentCatalogEntry,
} from '../componentCatalog';
import {
  BUILTIN_INSPECTOR_FIELDS,
  type InspectorFieldMeta,
} from '../inspectorMetadata';

export type AgentComponentFieldSchema = {
  name: string;
  type: string;
  default: unknown;
  editable: boolean;
  hidden: boolean;
  label?: string;
  description?: string;
  kind?: InspectorFieldMeta['kind'];
  options?: InspectorFieldMeta['options'];
  enumOptions?: FieldMeta['enumOptions'];
  assetKinds?: string[];
  referenceType?: string;
  allowNone?: boolean;
  noneValue?: string;
  min?: number;
  max?: number;
  step?: number;
  range?: [number, number];
  visibleWhen?: InspectorFieldMeta['visibleWhen'];
  showIf?: FieldMeta['showIf'];
  hideIf?: FieldMeta['hideIf'];
  enableIf?: FieldMeta['enableIf'];
  disableIf?: FieldMeta['disableIf'];
  required?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  suffix?: string;
};

export type AgentComponentMethodSchema = {
  name: string;
  label: string;
  button: boolean;
  buttonGroup?: string;
  contextMenu?: string;
};

export type AgentComponentSchema = {
  type: string;
  label: string;
  description: string;
  requires: string[];
  disallowMultiple: boolean;
  fields: AgentComponentFieldSchema[];
  methods: AgentComponentMethodSchema[];
};

const TRANSFORM_ENTRY: ComponentCatalogEntry = {
  type: 'Transform',
  label: 'Transform',
  description: 'Local 3D position, quaternion rotation, and scale',
  create: () => ({
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  }),
};

function inferFieldType(value: unknown): string {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) {
    if (value.length >= 2 && value.length <= 4 && value.every((item) => typeof item === 'number')) {
      return `vec${value.length}`;
    }
    return 'array';
  }
  if (value === null || value === undefined) return 'null';
  return 'object';
}

function behaviourFieldSchema(
  field: FieldMeta,
  defaults: Record<string, unknown>,
): AgentComponentFieldSchema {
  const min = field.range?.[0] ?? field.min;
  const max = field.range?.[1] ?? field.max;
  return {
    name: field.key,
    type: field.type,
    default: structuredClone(defaults[field.key]),
    editable: !field.hideInInspector && !field.readOnly,
    hidden: Boolean(field.hideInInspector),
    label: field.label,
    description: field.tooltip,
    enumOptions: field.enumOptions ? structuredClone(field.enumOptions) : undefined,
    assetKinds: field.assetKinds ? [...field.assetKinds] : undefined,
    referenceType: field.referenceType,
    allowNone: field.allowNone,
    min,
    max,
    range: field.range ? [...field.range] as [number, number] : undefined,
    showIf: field.showIf ? structuredClone(field.showIf) : undefined,
    hideIf: field.hideIf ? structuredClone(field.hideIf) : undefined,
    enableIf: field.enableIf ? structuredClone(field.enableIf) : undefined,
    disableIf: field.disableIf ? structuredClone(field.disableIf) : undefined,
    required: field.required,
    readOnly: field.readOnly,
    multiline: field.multiline,
    suffix: field.suffix,
  };
}

function builtinFieldSchema(
  name: string,
  value: unknown,
  metadata: InspectorFieldMeta | undefined,
): AgentComponentFieldSchema {
  return {
    name,
    type: inferFieldType(value),
    default: structuredClone(value),
    editable: !metadata?.hidden,
    hidden: Boolean(metadata?.hidden),
    label: metadata?.label,
    kind: metadata?.kind,
    options: metadata?.options ? structuredClone(metadata.options) : undefined,
    assetKinds: metadata?.assetKinds ? [...metadata.assetKinds] : undefined,
    referenceType: metadata?.referenceType,
    allowNone: metadata?.allowNone,
    noneValue: metadata?.noneValue,
    min: metadata?.min,
    max: metadata?.max,
    step: metadata?.step,
    visibleWhen: metadata?.visibleWhen
      ? structuredClone(metadata.visibleWhen)
      : undefined,
    multiline: metadata?.kind === 'multiline',
  };
}

function methodSchema(method: MethodMeta): AgentComponentMethodSchema {
  return {
    name: method.key,
    label: method.label ?? method.key,
    button: Boolean(method.button),
    buttonGroup: method.buttonGroup,
    contextMenu: method.contextMenu,
  };
}

function componentEntries(): ComponentCatalogEntry[] {
  return [TRANSFORM_ENTRY, ...getComponentCatalog()];
}

export function buildAgentComponentSchema(type: string): AgentComponentSchema | null {
  const entry = componentEntries().find((candidate) => candidate.type === type);
  if (!entry) return null;
  let defaults: Record<string, unknown>;
  try {
    defaults = entry.create() ?? {};
  } catch {
    defaults = {};
  }
  const behaviour = getBehaviour(entry.type);
  const fields = behaviour
    ? behaviour.fields
        .filter((field) => field.serialize)
        .map((field) => behaviourFieldSchema(field, defaults))
    : Object.entries(defaults).map(([name, value]) => (
        builtinFieldSchema(name, value, BUILTIN_INSPECTOR_FIELDS[entry.type]?.[name])
      ));
  return {
    type: entry.type,
    label: entry.label,
    description: entry.description,
    requires: [...(entry.requires ?? [])],
    disallowMultiple: behaviour?.disallowMultiple ?? true,
    fields,
    methods: behaviour?.methods.map(methodSchema) ?? [],
  };
}

export function listAgentComponentSchemas(): AgentComponentSchema[] {
  return componentEntries()
    .map((entry) => buildAgentComponentSchema(entry.type))
    .filter((entry): entry is AgentComponentSchema => entry != null);
}
