// Author: MiYu. Project a raster Canvas through one GPU draw with perspective-correct texture coordinates.
import type { SceneCanvasSurface } from './uiLayout';

type Projector = { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; program: WebGLProgram; buffer: WebGLBuffer; texture: WebGLTexture; position: number; uv: number; maxTextureSize: number; maxSurfaceSize: number; image?: HTMLCanvasElement; revision?: number; imageWidth?: number; imageHeight?: number; vertices?: Float32Array };
const projectors = new WeakMap<HTMLCanvasElement, Projector | null>();

/** Positive homogeneous weights keep rasterized triangles within their projected vertex bounds. */
function projectionCopyRect(vertices: Float32Array, width: number, height: number) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let index = 0; index < vertices.length; index += 5) {
    const w = vertices[index + 2];
    if (!(w > 0) || !Number.isFinite(w)) return null;
    const x = (vertices[index] / w + 1) * width * .5, y = (1 - vertices[index + 1] / w) * height * .5;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (!vertices.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(width, Math.max(0, Math.floor(left) - 1)), y = Math.min(height, Math.max(0, Math.floor(top) - 1));
  return { x, y, w: Math.max(0, Math.min(width, Math.ceil(right) + 1) - x), h: Math.max(0, Math.min(height, Math.ceil(bottom) + 1) - y) };
}

function createProjector(destination: HTMLCanvasElement): Projector | null {
  const canvas = destination.ownerDocument?.createElement('canvas');
  const gl = canvas?.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const result = gl.createShader(type);
    if (!result) return null;
    gl.shaderSource(result, source); gl.compileShader(result);
    if (gl.getShaderParameter(result, gl.COMPILE_STATUS)) return result;
    gl.deleteShader(result); return null;
  };
  const vertex = shader(gl.VERTEX_SHADER, 'attribute vec3 position; attribute vec2 uv; varying vec2 textureUV; void main() { gl_Position = vec4(position.xy, 0.0, position.z); textureUV = uv; }');
  const fragment = shader(gl.FRAGMENT_SHADER, '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 textureUV; uniform sampler2D image; void main() { gl_FragColor = texture2D(image, textureUV); }');
  const program = gl.createProgram(), buffer = gl.createBuffer(), texture = gl.createTexture();
  if (!vertex || !fragment || !program || !buffer || !texture) {
    if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program); if (buffer) gl.deleteBuffer(buffer); if (texture) gl.deleteTexture(texture);
    return null;
  }
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteTexture(texture); return null; }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  canvas.addEventListener('webglcontextlost', event => event.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => projectors.delete(destination));
  return { canvas, gl, program, buffer, texture, position: gl.getAttribLocation(program, 'position'), uv: gl.getAttribLocation(program, 'uv'), maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxSurfaceSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) };
}

export function projectSceneCanvasTexture(ctx: CanvasRenderingContext2D, surface: SceneCanvasSurface, image: HTMLCanvasElement, revision?: number): boolean {
  let projector = projectors.get(ctx.canvas);
  if (projector === undefined) { projector = createProjector(ctx.canvas); projectors.set(ctx.canvas, projector); }
  if (!projector || projector.gl.isContextLost()) return false;
  const { canvas, gl, program, buffer, texture, position, uv } = projector;
  if (Math.max(image.width, image.height) > projector.maxTextureSize || Math.max(ctx.canvas.width, ctx.canvas.height) > projector.maxSurfaceSize) return false;
  const resized = canvas.width !== ctx.canvas.width || canvas.height !== ctx.canvas.height;
  if (canvas.width !== ctx.canvas.width) canvas.width = ctx.canvas.width;
  if (canvas.height !== ctx.canvas.height) canvas.height = ctx.canvas.height;
  const upload = projector.image !== image || revision == null || projector.revision !== revision || projector.imageWidth !== image.width || projector.imageHeight !== image.height;
  const transform = ctx.getTransform(), vertices = new Float32Array(surface.pixels.length * 5);
  for (let index = 0; index < surface.pixels.length; index++) {
    const point = surface.corners[index], pixel = surface.pixels[index], w = 1 / surface.inverseW[index];
    const x = transform.a * point.x + transform.c * point.y + transform.e, y = transform.b * point.x + transform.d * point.y + transform.f;
    vertices.set([(x / canvas.width * 2 - 1) * w, (1 - y / canvas.height * 2) * w, w, (pixel.x - surface.bounds.x) / surface.bounds.w, (pixel.y - surface.bounds.y) / surface.bounds.h], index * 5);
  }
  const previousVertices = projector.vertices;
  if (resized || upload || previousVertices?.length !== vertices.length || vertices.some((value, index) => value !== previousVertices?.[index])) {
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    if (upload) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      projector.image = image; projector.revision = revision; projector.imageWidth = image.width; projector.imageHeight = image.height;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, surface.pixels.length);
    projector.vertices = vertices;
  }
  const copy = ctx.globalCompositeOperation === 'source-over' && ctx.filter === 'none' && ctx.shadowBlur === 0 && ctx.shadowOffsetX === 0 && ctx.shadowOffsetY === 0 ? projectionCopyRect(vertices, canvas.width, canvas.height) : null;
  if (copy && !(copy.w > 0 && copy.h > 0)) return true;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (copy) ctx.drawImage(canvas, copy.x, copy.y, copy.w, copy.h, copy.x, copy.y, copy.w, copy.h);
  else ctx.drawImage(canvas, 0, 0);
  ctx.restore();
  return true;
}
