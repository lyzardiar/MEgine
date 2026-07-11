import type { WorldCommand } from '@mengine/api';

/** High-level intents for AI / tools — validated then expanded to commands. */
export type Intent =
  | {
      kind: 'SpawnEnemy';
      archetype: string;
      at: [number, number, number];
      name?: string;
    }
  | {
      kind: 'SpawnMesh';
      mesh: string;
      material?: string;
      at: [number, number, number];
      name?: string;
    }
  | {
      kind: 'SetTransform';
      entity: number;
      position?: [number, number, number];
      rotation?: [number, number, number, number];
      scale?: [number, number, number];
    }
  | {
      kind: 'SetClearColor';
      color: [number, number, number, number];
    };

export interface ValidateResult {
  ok: boolean;
  errors: string[];
}

export function validateIntent(intent: Intent): ValidateResult {
  const errors: string[] = [];
  switch (intent.kind) {
    case 'SpawnEnemy':
    case 'SpawnMesh':
      if (!intent.at || intent.at.length !== 3) errors.push('at must be float3');
      break;
    case 'SetTransform':
      if (intent.entity == null) errors.push('entity required');
      break;
    case 'SetClearColor':
      if (!intent.color || intent.color.length !== 4) errors.push('color must be float4');
      break;
  }
  return { ok: errors.length === 0, errors };
}

export function expandIntent(intent: Intent): WorldCommand[] {
  const v = validateIntent(intent);
  if (!v.ok) {
    throw new Error(`Invalid intent: ${v.errors.join('; ')}`);
  }
  switch (intent.kind) {
    case 'SpawnEnemy':
      return [
        {
          op: 'spawn',
          name: intent.name ?? intent.archetype,
          components: {
            Transform: {
              position: intent.at,
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
            },
            MeshRenderer: { mesh: 'cube', material: 'default' },
          },
        },
      ];
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
    case 'SetTransform':
      return [
        {
          op: 'setComponent',
          entity: intent.entity,
          component: 'Transform',
          value: {
            position: intent.position ?? [0, 0, 0],
            rotation: intent.rotation ?? [0, 0, 0, 1],
            scale: intent.scale ?? [1, 1, 1],
          },
        },
      ];
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

export function expandIntents(intents: Intent[]): WorldCommand[] {
  return intents.flatMap(expandIntent);
}
