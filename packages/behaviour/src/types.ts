import type { ComponentType } from './components.js';

/** Serialized with custom Behaviour data so native scene/Prefab code can remap entity fields. */
export const ENTITY_REFERENCE_FIELDS_KEY = '__mengine_entity_reference_fields';

export type FieldType =
  | 'number'
  | 'boolean'
  | 'string'
  | 'vec3'
  | 'enum'
  | 'color'
  | 'entity'
  | 'sprite'
  | 'asset';

export type EnumOption = { value: string | number; label: string };

export type FieldCondition = { field: string; equals: unknown };

export type FieldMeta = {
  key: string;
  type: FieldType;
  label?: string;
  tooltip?: string;
  range?: [number, number];
  min?: number;
  max?: number;
  multiline?: boolean;
  textAreaMinLines?: number;
  textAreaMaxLines?: number;
  multilineLines?: number;
  enumOptions?: EnumOption[];
  /** Project asset kinds accepted by an asset reference field. */
  assetKinds?: string[];
  referenceType?: string;
  allowNone?: boolean;
  hideInInspector?: boolean;
  /** When false, field is not written to scene JSON. Default true if decorated. */
  serialize: boolean;
  order?: number;
  spaceBefore?: number;
  readOnly?: boolean;
  suffix?: string;
  title?: string;
  header?: string;
  infoBox?: string;
  required?: boolean;
  toggleLeft?: boolean;
  progressBar?: boolean;
  showIf?: FieldCondition;
  hideIf?: FieldCondition;
  enableIf?: FieldCondition;
  disableIf?: FieldCondition;
  boxGroup?: string;
  foldoutGroup?: string;
  horizontalGroup?: string;
  onValueChanged?: string;
};

export type MethodMeta = {
  key: string;
  label?: string;
  button?: boolean;
  buttonGroup?: string;
  contextMenu?: string;
};

export type BehaviourContext = {
  dt: number;
  entity: number;
  get: {
    <T>(ctor: ComponentType<T>): T | undefined;
    <T = Record<string, unknown>>(type: string): T | undefined;
  };
  set: {
    <T>(ctor: ComponentType<T>, value: T): void;
    (type: string, value: Record<string, unknown>): void;
  };
  patch: {
    <T>(ctor: ComponentType<T>, patch: Partial<T>): void;
    (type: string, patch: Record<string, unknown>): void;
  };
};

export type BehaviourCtor = (new () => import('./Behaviour.js').Behaviour) & {
  readonly typeName?: string;
};

export type BehaviourEntry = {
  type: string;
  label: string;
  description: string;
  ctor: BehaviourCtor;
  fields: FieldMeta[];
  methods: MethodMeta[];
  defaults: () => Record<string, unknown>;
  requires: string[];
  disallowMultiple: boolean;
};

export type * from './components.js';
