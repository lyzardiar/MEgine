import { normalizeProjectAssetPath } from './projectAssets.ts';
import {
  localizePrefabEntityReferences,
  validatePrefabEntityReferences,
} from './entityReferences.ts';

export const PREFAB_VERSION = 1;
export const PREFAB_LINK_COMPONENT = '__MEnginePrefab';

export interface PrefabNode {
  id: string;
  name: string;
  active: boolean;
  components: Record<string, unknown>;
  children: PrefabNode[];
}

export interface PrefabAsset {
  version: number;
  name: string;
  root: PrefabNode;
}

export interface PrefabLink {
  source: string;
  instance: string;
  node: string;
  root: boolean;
}

export interface PrefabEntity {
  entity: number;
  name?: string | null;
  parent?: number | null;
  siblingIndex: number;
  active: boolean;
  components: Record<string, unknown>;
}

export interface CapturedPrefab {
  asset: PrefabAsset;
  nodeIds: Map<number, string>;
}

let generatedId = 0;

export function createPrefabId(prefix: 'node' | 'instance' = 'node'): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  generatedId += 1;
  return `${prefix}-${Date.now().toString(36)}-${generatedId.toString(36)}`;
}

function objectValue(value: unknown, description: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${description} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeNode(value: unknown, path: string, ids: Set<string>, count: { value: number }): PrefabNode {
  const raw = objectValue(value, `prefab node ${path}`);
  count.value += 1;
  if (count.value > 65_536) throw new Error('prefab exceeds 65536 nodes');
  if (path.split('/').length > 257) throw new Error('prefab exceeds 256 hierarchy levels');
  const id = String(raw.id ?? '').trim();
  const name = String(raw.name ?? '').trim();
  if (!id) throw new Error(`prefab node ${path} has no id`);
  if (ids.has(id)) throw new Error(`duplicate prefab node id: ${id}`);
  if (!name) throw new Error(`prefab node ${id} has no name`);
  ids.add(id);
  const components = objectValue(raw.components ?? {}, `prefab node ${id} components`);
  const children = raw.children ?? [];
  if (!Array.isArray(children)) throw new Error(`prefab node ${id} children must be an array`);
  return {
    id,
    name,
    active: raw.active !== false,
    components: structuredClone(components),
    children: children.map((child, index) => normalizeNode(child, `${path}/${index}`, ids, count)),
  };
}

function legacyNode(value: unknown, path: number[]): PrefabNode {
  const raw = objectValue(value, 'legacy prefab node');
  const name = String(raw.name ?? '').trim();
  if (!name) throw new Error('legacy prefab node has no name');
  const children = raw.children ?? [];
  if (!Array.isArray(children)) throw new Error(`legacy prefab node ${name} children must be an array`);
  return {
    id: path.length ? `node-${path.join('-')}` : 'root',
    name,
    active: true,
    components: structuredClone(objectValue(raw.components ?? {}, `legacy prefab node ${name} components`)),
    children: children.map((child, index) => legacyNode(child, [...path, index])),
  };
}

function validateReferenceTokens(prefab: PrefabAsset): PrefabAsset {
  const nodeIds = new Set<string>();
  const collect = (node: PrefabNode) => {
    nodeIds.add(node.id);
    node.children.forEach(collect);
  };
  const validate = (node: PrefabNode) => {
    validatePrefabEntityReferences(node.components, nodeIds);
    node.children.forEach(validate);
  };
  collect(prefab.root);
  validate(prefab.root);
  return prefab;
}

export function normalizePrefabAsset(value: unknown): PrefabAsset {
  const raw = objectValue(value, 'prefab');
  const version = Number(raw.version ?? PREFAB_VERSION);
  if (version !== PREFAB_VERSION) throw new Error(`unsupported prefab version: ${version}`);
  if (raw.root == null) {
    const root = legacyNode(raw, []);
    return validateReferenceTokens({ version: PREFAB_VERSION, name: root.name, root });
  }
  const name = String(raw.name ?? '').trim();
  if (!name) throw new Error('prefab name is empty');
  const prefab = {
    version: PREFAB_VERSION,
    name,
    root: normalizeNode(raw.root, 'root', new Set(), { value: 0 }),
  };
  return validateReferenceTokens(prefab);
}

export function parsePrefabAsset(text: string): PrefabAsset {
  return normalizePrefabAsset(JSON.parse(text));
}

export function serializePrefabAsset(prefab: PrefabAsset): string {
  return `${JSON.stringify(normalizePrefabAsset(prefab), null, 2)}\n`;
}

export function readPrefabLink(entity: Pick<PrefabEntity, 'components'> | undefined): PrefabLink | null {
  const raw = entity?.components[PREFAB_LINK_COMPONENT];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const link = raw as Partial<PrefabLink>;
  if (!link.source || !link.instance || !link.node) return null;
  try {
    return {
      source: normalizeProjectAssetPath(String(link.source)),
      instance: String(link.instance),
      node: String(link.node),
      root: link.root === true,
    };
  } catch {
    return null;
  }
}

export function findPrefabInstance(
  entities: readonly PrefabEntity[],
  entityId: number,
): { root: number; link: PrefabLink } | null {
  const selected = entities.find((entity) => entity.entity === entityId);
  const selectedLink = readPrefabLink(selected);
  if (!selectedLink) return null;
  const root = entities.find((entity) => {
    const link = readPrefabLink(entity);
    return link?.instance === selectedLink.instance && link.source === selectedLink.source && link.root;
  });
  return root ? { root: root.entity, link: selectedLink } : null;
}

function prefabInstanceKey(link: Pick<PrefabLink, 'source' | 'instance'>): string {
  return `${link.source}\u0000${link.instance}`;
}

/**
 * Clone component payloads without creating duplicate or orphan prefab identities.
 * Complete linked roots become independent instances; partial linked subtrees unpack.
 */
export function clonePrefabLinkedComponents(
  entities: readonly Pick<PrefabEntity, 'entity' | 'components'>[],
  options: {
    preserveInstanceIds?: boolean;
    createInstanceId?: () => string;
  } = {},
): Map<number, Record<string, unknown>> {
  const instanceIds = new Map<string, string>();
  for (const entity of entities) {
    const link = readPrefabLink(entity);
    if (!link?.root) continue;
    instanceIds.set(
      prefabInstanceKey(link),
      options.preserveInstanceIds
        ? link.instance
        : (options.createInstanceId ?? (() => createPrefabId('instance')))(),
    );
  }
  return new Map(entities.map((entity) => {
    const components = structuredClone(entity.components);
    if (!(PREFAB_LINK_COMPONENT in components)) return [entity.entity, components];
    const link = readPrefabLink(entity);
    const instance = link ? instanceIds.get(prefabInstanceKey(link)) : null;
    if (!link || !instance) {
      delete components[PREFAB_LINK_COMPONENT];
    } else {
      components[PREFAB_LINK_COMPONENT] = { ...link, instance };
    }
    return [entity.entity, components];
  }));
}

export function capturePrefabAsset(
  name: string,
  entities: readonly PrefabEntity[],
  rootEntity: number,
  options: {
    source?: string;
    createNodeId?: () => string;
  } = {},
): CapturedPrefab {
  const entityById = new Map(entities.map((entity) => [entity.entity, entity]));
  if (!entityById.has(rootEntity)) throw new Error(`prefab root entity does not exist: ${rootEntity}`);
  const childrenByParent = new Map<number, PrefabEntity[]>();
  for (const entity of entities) {
    if (entity.parent == null) continue;
    const children = childrenByParent.get(entity.parent) ?? [];
    children.push(entity);
    childrenByParent.set(entity.parent, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.siblingIndex - b.siblingIndex || a.entity - b.entity);
  }

  const normalizedSource = options.source ? normalizeProjectAssetPath(options.source) : null;
  const createNodeId = options.createNodeId ?? (() => createPrefabId('node'));
  const nodeIds = new Map<number, string>();
  const capturedNodes = new Map<number, PrefabNode>();
  const usedNodeIds = new Set<string>();
  const visiting = new Set<number>();

  const capture = (entityId: number): PrefabNode => {
    if (visiting.has(entityId)) throw new Error(`cycle in prefab hierarchy at entity ${entityId}`);
    visiting.add(entityId);
    const entity = entityById.get(entityId)!;
    const existing = readPrefabLink(entity);
    let nodeId = normalizedSource && existing?.source === normalizedSource ? existing.node : createNodeId();
    while (!nodeId || usedNodeIds.has(nodeId)) nodeId = createNodeId();
    usedNodeIds.add(nodeId);
    nodeIds.set(entityId, nodeId);
    const components = structuredClone(entity.components);
    delete components[PREFAB_LINK_COMPONENT];
    const node: PrefabNode = {
      id: nodeId,
      name: entity.name?.trim() || 'GameObject',
      active: entity.active !== false,
      components,
      children: (childrenByParent.get(entityId) ?? []).map((child) => capture(child.entity)),
    };
    capturedNodes.set(entityId, node);
    visiting.delete(entityId);
    return node;
  };

  const root = capture(rootEntity);
  for (const [entity, node] of capturedNodes) {
    node.components = localizePrefabEntityReferences(
      entityById.get(entity)!.components,
      nodeIds,
    );
    delete node.components[PREFAB_LINK_COMPONENT];
  }
  return {
    asset: normalizePrefabAsset({ version: PREFAB_VERSION, name: name.trim() || root.name, root }),
    nodeIds,
  };
}

export function flattenPrefabNodes(prefab: PrefabAsset): Array<{
  node: PrefabNode;
  parentNodeId: string | null;
  siblingIndex: number;
}> {
  const normalized = normalizePrefabAsset(prefab);
  const out: Array<{ node: PrefabNode; parentNodeId: string | null; siblingIndex: number }> = [];
  const visit = (node: PrefabNode, parentNodeId: string | null, siblingIndex: number) => {
    out.push({ node, parentNodeId, siblingIndex });
    node.children.forEach((child, index) => visit(child, node.id, index));
  };
  visit(normalized.root, null, 0);
  return out;
}
