import type { AgentJsonSchema } from './commandSchemas.ts';

const MAX_SCHEMA_ISSUES = 32;

function typeMatches(value: unknown, expected: unknown): boolean {
  switch (expected) {
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
    case 'boolean':
      return typeof value === expected;
    default:
      return true;
  }
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, stableJson((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function schemaValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function validateValue(
  value: unknown,
  schema: AgentJsonSchema,
  path: string,
  issues: string[],
): void {
  if (issues.length >= MAX_SCHEMA_ISSUES) return;

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => {
      const candidateIssues: string[] = [];
      validateValue(
        value,
        candidate as AgentJsonSchema,
        path,
        candidateIssues,
      );
      return candidateIssues.length === 0;
    });
    if (matches.length !== 1) {
      issues.push(`${path} must match exactly one allowed shape`);
    }
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.some((candidate) => {
      const candidateIssues: string[] = [];
      validateValue(
        value,
        candidate as AgentJsonSchema,
        path,
        candidateIssues,
      );
      return candidateIssues.length === 0;
    });
    if (!matches) issues.push(`${path} must match at least one allowed shape`);
  }

  const expectedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type == null
      ? []
      : [schema.type];
  if (
    expectedTypes.length > 0
    && !expectedTypes.some((expected) => typeMatches(value, expected))
  ) {
    issues.push(`${path} must be ${expectedTypes.join(' or ')}`);
    return;
  }

  if ('const' in schema && !schemaValuesEqual(value, schema.const)) {
    issues.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  }
  if (
    Array.isArray(schema.enum)
    && !schema.enum.some((candidate) => schemaValuesEqual(value, candidate))
  ) {
    issues.push(
      `${path} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`,
    );
  }

  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < Number(schema.minLength)) {
      issues.push(`${path} must contain at least ${schema.minLength} characters`);
    }
    if (Number.isInteger(schema.maxLength) && value.length > Number(schema.maxLength)) {
      issues.push(`${path} must contain at most ${schema.maxLength} characters`);
    }
    if (
      typeof schema.pattern === 'string'
      && !new RegExp(schema.pattern, 'u').test(value)
    ) {
      issues.push(`${path} does not match the required pattern`);
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      issues.push(`${path} must be at least ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      issues.push(`${path} must be at most ${schema.maximum}`);
    }
    if (
      typeof schema.exclusiveMinimum === 'number'
      && value <= schema.exclusiveMinimum
    ) {
      issues.push(`${path} must be greater than ${schema.exclusiveMinimum}`);
    }
    if (
      typeof schema.exclusiveMaximum === 'number'
      && value >= schema.exclusiveMaximum
    ) {
      issues.push(`${path} must be less than ${schema.exclusiveMaximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < Number(schema.minItems)) {
      issues.push(`${path} must contain at least ${schema.minItems} items`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > Number(schema.maxItems)) {
      issues.push(`${path} must contain at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems) {
      const keys = value.map((item) => JSON.stringify(stableJson(item)));
      if (new Set(keys).size !== keys.length) {
        issues.push(`${path} must contain unique items`);
      }
    }
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, index) => {
        validateValue(
          item,
          schema.items as AgentJsonSchema,
          `${path}[${index}]`,
          issues,
        );
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    const properties = (
      schema.properties
      && typeof schema.properties === 'object'
      && !Array.isArray(schema.properties)
    )
      ? schema.properties as Record<string, AgentJsonSchema>
      : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (
        typeof key === 'string'
        && (!Object.hasOwn(objectValue, key) || objectValue[key] === undefined)
      ) {
        issues.push(`${path}.${key} is required`);
      }
    }
    for (const [key, item] of Object.entries(objectValue)) {
      if (Object.hasOwn(properties, key)) {
        validateValue(item, properties[key], `${path}.${key}`, issues);
      } else if (schema.additionalProperties === false) {
        issues.push(`${path}.${key} is not allowed`);
      } else if (
        schema.additionalProperties
        && typeof schema.additionalProperties === 'object'
        && !Array.isArray(schema.additionalProperties)
      ) {
        validateValue(
          item,
          schema.additionalProperties as AgentJsonSchema,
          `${path}.${key}`,
          issues,
        );
      }
      if (issues.length >= MAX_SCHEMA_ISSUES) break;
    }
  }
}

export function validateAgentJsonSchema(
  value: unknown,
  schema: AgentJsonSchema,
): string[] {
  const issues: string[] = [];
  validateValue(value, schema, '$', issues);
  return issues.slice(0, MAX_SCHEMA_ISSUES);
}
