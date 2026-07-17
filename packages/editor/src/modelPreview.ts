import { readProjectAssetBytes, resolveProjectAssetPath } from './projectAssets.ts';
import type { Vec3 } from './math3d.ts';

export type PreviewMesh = {
  positions: Vec3[];
  indices: number[];
};

type JsonObject = Record<string, unknown>;
type PreviewState = { mesh: PreviewMesh | null; loading: boolean; error: string | null };

const cache = new Map<string, PreviewState>();
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function object(value: unknown): JsonObject | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dataUriBytes(uri: string): Uint8Array {
  const comma = uri.indexOf(',');
  if (comma < 0) throw new Error('invalid glTF data URI');
  const metadata = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  if (metadata.endsWith(';base64')) {
    const decoded = atob(payload);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

function parseGlb(bytes: Uint8Array): { document: JsonObject; binary: Uint8Array | null } {
  if (bytes.byteLength < 20) throw new Error('GLB header is truncated');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error('unsupported GLB header');
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength > bytes.byteLength) throw new Error('GLB length exceeds the asset size');
  let offset = 12;
  let document: JsonObject | null = null;
  let binary: Uint8Array | null = null;
  while (offset + 8 <= declaredLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + length > declaredLength) throw new Error('GLB chunk is truncated');
    const chunk = bytes.subarray(offset, offset + length);
    if (type === JSON_CHUNK) {
      document = object(JSON.parse(new TextDecoder().decode(chunk).replace(/\0+$/g, '').trim()));
    } else if (type === BIN_CHUNK) {
      binary = chunk;
    }
    offset += length;
  }
  if (!document) throw new Error('GLB has no JSON chunk');
  return { document, binary };
}

async function loadBuffers(
  modelPath: string,
  document: JsonObject,
  binary: Uint8Array | null,
): Promise<Uint8Array[]> {
  const descriptions = Array.isArray(document.buffers) ? document.buffers : [];
  return Promise.all(descriptions.map(async (descriptionValue, index) => {
    const description = object(descriptionValue);
    const uri = typeof description?.uri === 'string' ? description.uri : '';
    if (!uri) {
      if (index === 0 && binary) return binary;
      throw new Error(`glTF buffer ${index} has no URI or GLB binary chunk`);
    }
    if (uri.startsWith('data:')) return dataUriBytes(uri);
    return readProjectAssetBytes(resolveProjectAssetPath(modelPath, decodeURIComponent(uri)));
  }));
}

function accessorValues(
  document: JsonObject,
  buffers: Uint8Array[],
  accessorIndex: number,
  expectedType: 'SCALAR' | 'VEC3',
): number[][] {
  const accessors = Array.isArray(document.accessors) ? document.accessors : [];
  const bufferViews = Array.isArray(document.bufferViews) ? document.bufferViews : [];
  const accessor = object(accessors[accessorIndex]);
  if (!accessor || accessor.type !== expectedType || accessor.sparse != null) {
    throw new Error(`unsupported glTF accessor ${accessorIndex}`);
  }
  const bufferViewIndex = numberValue(accessor.bufferView, -1);
  const bufferView = object(bufferViews[bufferViewIndex]);
  const bufferIndex = numberValue(bufferView?.buffer, -1);
  const buffer = buffers[bufferIndex];
  if (!buffer || !bufferView) throw new Error(`glTF accessor ${accessorIndex} has no buffer view`);
  const componentType = numberValue(accessor.componentType, -1);
  const count = numberValue(accessor.count, 0);
  const components = expectedType === 'VEC3' ? 3 : 1;
  const componentBytes = componentType === 5121 ? 1 : componentType === 5123 ? 2 : 4;
  if ((expectedType === 'VEC3' && componentType !== 5126)
    || (expectedType === 'SCALAR' && ![5121, 5123, 5125].includes(componentType))) {
    throw new Error(`unsupported glTF component type ${componentType}`);
  }
  const stride = numberValue(bufferView.byteStride, componentBytes * components);
  const start = numberValue(bufferView.byteOffset) + numberValue(accessor.byteOffset);
  if (count < 0 || count > 2_000_000 || start + Math.max(0, count - 1) * stride + componentBytes * components > buffer.byteLength) {
    throw new Error(`glTF accessor ${accessorIndex} exceeds its buffer`);
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const result: number[][] = [];
  for (let row = 0; row < count; row += 1) {
    const values: number[] = [];
    for (let column = 0; column < components; column += 1) {
      const offset = start + row * stride + column * componentBytes;
      values.push(componentType === 5121
        ? view.getUint8(offset)
        : componentType === 5123
          ? view.getUint16(offset, true)
          : componentType === 5125
            ? view.getUint32(offset, true)
            : view.getFloat32(offset, true));
    }
    result.push(values);
  }
  return result;
}

export function parseGltfPreview(document: JsonObject, buffers: Uint8Array[]): PreviewMesh {
  const meshes = Array.isArray(document.meshes) ? document.meshes : [];
  const mesh = object(meshes[0]);
  const primitives = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
  const positions: Vec3[] = [];
  const indices: number[] = [];
  for (const primitiveValue of primitives) {
    const primitive = object(primitiveValue);
    if (!primitive || (primitive.mode != null && primitive.mode !== 4)) {
      throw new Error('editor preview supports triangle glTF primitives only');
    }
    const positionAccessor = numberValue(object(primitive.attributes)?.POSITION, -1);
    const localPositions = accessorValues(document, buffers, positionAccessor, 'VEC3')
      .map((value) => [value[0], value[1], value[2]] as Vec3);
    const localIndices = primitive.indices == null
      ? localPositions.map((_, index) => index)
      : accessorValues(document, buffers, numberValue(primitive.indices, -1), 'SCALAR')
        .map((value) => value[0]);
    if (localIndices.length % 3 !== 0
      || localIndices.some((index) => index < 0 || index >= localPositions.length)) {
      throw new Error('glTF triangle indices are invalid');
    }
    const base = positions.length;
    positions.push(...localPositions);
    indices.push(...localIndices.map((index) => base + index));
  }
  if (positions.length === 0 || indices.length === 0) throw new Error('glTF has no preview geometry');
  return { positions, indices };
}

async function loadModel(path: string): Promise<PreviewMesh> {
  const bytes = await readProjectAssetBytes(path);
  const isGlb = path.toLowerCase().endsWith('.glb');
  const parsed = isGlb
    ? parseGlb(bytes)
    : { document: object(JSON.parse(new TextDecoder().decode(bytes))), binary: null };
  if (!parsed.document) throw new Error('glTF root must be an object');
  const buffers = await loadBuffers(path, parsed.document, parsed.binary);
  return parseGltfPreview(parsed.document, buffers);
}

/** Returns the cached mesh immediately and starts an asynchronous load on first use. */
export function modelPreview(path: string): PreviewMesh | null {
  const existing = cache.get(path);
  if (existing) return existing.mesh;
  const state: PreviewState = { mesh: null, loading: true, error: null };
  cache.set(path, state);
  void loadModel(path)
    .then((mesh) => {
      state.mesh = mesh;
      state.loading = false;
    })
    .catch((reason) => {
      state.loading = false;
      state.error = reason instanceof Error ? reason.message : String(reason);
      console.warn(`Model preview failed for ${path}: ${state.error}`);
    });
  return null;
}

export function clearModelPreview(path?: string): void {
  if (path) cache.delete(path);
  else cache.clear();
}
