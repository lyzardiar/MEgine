import type { WorldCommand } from '@mengine/api';

export type Float3 = [number, number, number];
export type Float4 = [number, number, number, number];

export interface TransformValue {
  position: Float3;
  rotation: Float4;
  scale: Float3;
}

/**
 * High-level, editor-supported intents for AI agents and tools.
 *
 * Intents stay deliberately small and deterministic. Domain-specific spawning
 * belongs in the editor's typed-entity and asset-instantiation commands.
 */
export type Intent =
  | {
      kind: 'SpawnMesh';
      mesh: string;
      material?: string;
      at: Float3;
      name?: string;
    }
  | {
      kind: 'SetTransform';
      entity: number;
      position?: Float3;
      rotation?: Float4;
      scale?: Float3;
    }
  | {
      kind: 'SetClearColor';
      color: Float4;
    };

export interface ValidateResult {
  ok: boolean;
  errors: string[];
}

export interface IntentExpansionContext {
  /**
   * Required when a SetTransform intent omits one or more fields. The resolver
   * prevents omitted values from being reset to identity by accident.
   */
  getTransform?: (entity: number) => TransformValue | null | undefined;
}

export type IntentJsonSchema = Record<string, unknown>;

export interface IntentDefinition {
  kind: Intent['kind'];
  description: string;
  schema: IntentJsonSchema;
}

const stringSchema = (description: string): IntentJsonSchema => ({
  type: 'string',
  minLength: 1,
  maxLength: 1024,
  description,
});

const tupleSchema = (length: number, description: string): IntentJsonSchema => ({
  type: 'array',
  minItems: length,
  maxItems: length,
  items: { type: 'number' },
  description,
});

const objectSchema = (
  properties: Record<string, IntentJsonSchema>,
  required: string[],
  extra: IntentJsonSchema = {},
): IntentJsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
  ...extra,
});

export const INTENT_DEFINITIONS: readonly IntentDefinition[] = [
  {
    kind: 'SpawnMesh',
    description: 'Spawn one mesh entity at a local position',
    schema: objectSchema({
      kind: { const: 'SpawnMesh' },
      mesh: stringSchema('Mesh identifier or project asset path'),
      material: stringSchema('Optional material identifier or project asset path'),
      at: tupleSchema(3, 'Local position [x, y, z]'),
      name: stringSchema('Optional entity name'),
    }, ['kind', 'mesh', 'at']),
  },
  {
    kind: 'SetTransform',
    description: 'Set one or more local transform fields without resetting omitted fields',
    schema: objectSchema({
      kind: { const: 'SetTransform' },
      entity: {
        type: 'integer',
        minimum: 0,
        description: 'Entity id',
      },
      position: tupleSchema(3, 'Local position [x, y, z]'),
      rotation: tupleSchema(4, 'Local quaternion [x, y, z, w]'),
      scale: tupleSchema(3, 'Local scale [x, y, z]'),
    }, ['kind', 'entity'], {
      anyOf: [
        { required: ['position'] },
        { required: ['rotation'] },
        { required: ['scale'] },
      ],
    }),
  },
  {
    kind: 'SetClearColor',
    description: 'Set the scene clear color using normalized RGBA channels',
    schema: objectSchema({
      kind: { const: 'SetClearColor' },
      color: {
        ...tupleSchema(4, 'Normalized RGBA channels'),
        items: { type: 'number', minimum: 0, maximum: 1 },
      },
    }, ['kind', 'color']),
  },
] as const;

export const INTENT_SCHEMA: IntentJsonSchema = {
  oneOf: INTENT_DEFINITIONS.map((definition) => definition.schema),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  errors: string[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`"${key}" is not allowed`);
  }
}

function checkString(
  value: unknown,
  key: string,
  errors: string[],
  optional = false,
): void {
  if (value === undefined && optional) return;
  if (
    typeof value !== 'string'
    || !value.trim()
    || value.length > 1024
  ) {
    errors.push(`"${key}" must be a non-empty string of at most 1024 characters`);
  }
}

function checkTuple(
  value: unknown,
  key: string,
  length: number,
  errors: string[],
  options: { optional?: boolean; normalized?: boolean } = {},
): void {
  if (value === undefined && options.optional) return;
  if (
    !Array.isArray(value)
    || value.length !== length
    || value.some((item) => (
      typeof item !== 'number'
      || !Number.isFinite(item)
      || (options.normalized && (item < 0 || item > 1))
    ))
  ) {
    errors.push(
      options.normalized
        ? `"${key}" must be ${length} finite numbers from 0 to 1`
        : `"${key}" must be ${length} finite numbers`,
    );
  }
}

export function validateIntent(value: unknown): ValidateResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ['intent must be an object'] };
  }
  const kind = value.kind;
  if (typeof kind !== 'string') {
    return { ok: false, errors: ['"kind" must be a supported intent string'] };
  }

  switch (kind) {
    case 'SpawnMesh':
      checkAllowedKeys(value, ['kind', 'mesh', 'material', 'at', 'name'], errors);
      checkString(value.mesh, 'mesh', errors);
      checkString(value.material, 'material', errors, true);
      checkTuple(value.at, 'at', 3, errors);
      checkString(value.name, 'name', errors, true);
      break;
    case 'SetTransform':
      checkAllowedKeys(
        value,
        ['kind', 'entity', 'position', 'rotation', 'scale'],
        errors,
      );
      if (
        typeof value.entity !== 'number'
        || !Number.isSafeInteger(value.entity)
        || value.entity < 0
      ) {
        errors.push('"entity" must be a non-negative safe integer');
      }
      checkTuple(value.position, 'position', 3, errors, { optional: true });
      checkTuple(value.rotation, 'rotation', 4, errors, { optional: true });
      checkTuple(value.scale, 'scale', 3, errors, { optional: true });
      if (
        value.position === undefined
        && value.rotation === undefined
        && value.scale === undefined
      ) {
        errors.push('SetTransform requires position, rotation, or scale');
      }
      break;
    case 'SetClearColor':
      checkAllowedKeys(value, ['kind', 'color'], errors);
      checkTuple(value.color, 'color', 4, errors, { normalized: true });
      break;
    default:
      errors.push(`unsupported intent kind "${kind}"`);
      break;
  }

  return { ok: errors.length === 0, errors };
}

function checkedIntent(value: unknown): Intent {
  const result = validateIntent(value);
  if (!result.ok) {
    throw new Error(`Invalid intent: ${result.errors.join('; ')}`);
  }
  return value as Intent;
}

function resolvedTransform(
  intent: Extract<Intent, { kind: 'SetTransform' }>,
  context: IntentExpansionContext,
): TransformValue {
  const needsCurrent = (
    intent.position === undefined
    || intent.rotation === undefined
    || intent.scale === undefined
  );
  const current = needsCurrent ? context.getTransform?.(intent.entity) : undefined;
  if (needsCurrent && !current) {
    throw new Error(
      `Invalid intent: SetTransform for entity ${intent.entity} requires current transform context`,
    );
  }
  return {
    position: intent.position ?? current!.position,
    rotation: intent.rotation ?? current!.rotation,
    scale: intent.scale ?? current!.scale,
  };
}

export function expandIntent(
  value: unknown,
  context: IntentExpansionContext = {},
): WorldCommand[] {
  const intent = checkedIntent(value);
  switch (intent.kind) {
    case 'SpawnMesh':
      return [
        {
          op: 'spawn',
          name: intent.name ?? intent.mesh,
          components: {
            Transform: {
              position: intent.at,
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
            },
            MeshRenderer: {
              mesh: intent.mesh,
              material: intent.material ?? 'default',
            },
          },
        },
      ];
    case 'SetTransform': {
      const transform = resolvedTransform(intent, context);
      return [
        {
          op: 'setComponent',
          entity: intent.entity,
          component: 'Transform',
          value: { ...transform },
        },
      ];
    }
    case 'SetClearColor':
      return [
        {
          op: 'setClearColor',
          r: intent.color[0],
          g: intent.color[1],
          b: intent.color[2],
          a: intent.color[3],
        },
      ];
  }
}

export function expandIntents(
  intents: readonly unknown[],
  context: IntentExpansionContext = {},
): WorldCommand[] {
  return intents.flatMap((intent) => expandIntent(intent, context));
}
