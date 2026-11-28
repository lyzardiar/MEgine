/**
 * MEngine Web/WASM Player Host — Browser-Native JS Execution (Zero V8/QuickJS Overhead).
 *
 * Implements the shared MEngine contract (`engine.*` CommandBuffer, Snapshot,
 * async VFS asset loading, WebGPU/WebGL2 capability negotiation, WebAudio buses,
 * and multi-touch/pointer/keyboard input) directly on the browser's native JS engine.
 */

export type WebGraphicsBackend = 'webgpu' | 'webgl2' | 'canvas2d';

export interface WebTouchPoint {
  id: number;
  x: number;
  y: number;
  phase: 'began' | 'moved' | 'ended' | 'cancelled';
}

export interface WebInputSnapshot {
  keys: string[];
  pointer: { x: number; y: number; down: boolean };
  touches: WebTouchPoint[];
}

export interface WebCommand {
  op: string;
  [key: string]: unknown;
}

export interface WebEngineIdentity {
  backend: 'web-native-js';
  bridgeVersion: 1;
  graphics: WebGraphicsBackend;
  zeroVmOverhead: true;
}

export function normalizeWebAssetPath(raw: string): string {
  const cleaned = raw.trim().replace(/\\/g, '/');
  const segments = cleaned.split('/').filter((seg) => seg.length > 0 && seg !== '.');
  if (segments.length === 0 || segments.some((seg) => seg === '..' || seg.includes('\0'))) {
    throw new Error(`Invalid web asset path: ${raw}`);
  }
  return segments.join('/');
}

export class WebVfsLoader {
  private readonly cache = new Map<string, ArrayBuffer>();
  private readonly baseUrl: string;

  constructor(baseUrl = './') {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async readBytes(relativePath: string): Promise<ArrayBuffer> {
    const normalized = normalizeWebAssetPath(relativePath);
    const hit = this.cache.get(normalized);
    if (hit) return hit;
    const response = await fetch(`${this.baseUrl}${normalized}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch asset '${normalized}' (${response.status})`);
    }
    const bytes = await response.arrayBuffer();
    this.cache.set(normalized, bytes);
    return bytes;
  }

  async readJson<T = unknown>(relativePath: string): Promise<T> {
    const bytes = await this.readBytes(relativePath);
    const text = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(text) as T;
  }
}

export class WebAudioHost {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }
}

export async function probeWebGraphicsBackend(canvas: HTMLCanvasElement): Promise<WebGraphicsBackend> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      // Fall through to WebGL2.
    }
  }
  if (canvas.getContext('webgl2')) return 'webgl2';
  return 'canvas2d';
}

export class WebEngineHost {
  readonly vfs: WebVfsLoader;
  readonly audio = new WebAudioHost();
  private readonly canvas: HTMLCanvasElement;
  private readonly commandQueue: WebCommand[] = [];
  private readonly keysDown = new Set<string>();
  private readonly pointer = { x: 0, y: 0, down: false };
  private readonly touches = new Map<number, WebTouchPoint>();
  private rafId: number | null = null;
  private lastTimeMs = 0;
  private frame = 0;
  private graphics: WebGraphicsBackend = 'webgl2';
  private onTickCallback: ((dt: number, frame: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, baseAssetUrl = './') {
    this.canvas = canvas;
    this.vfs = new WebVfsLoader(baseAssetUrl);
  }

  async init(): Promise<WebEngineIdentity> {
    this.graphics = await probeWebGraphicsBackend(this.canvas);
    this.bindEvents();
    this.resizeCanvas();
    return {
      backend: 'web-native-js',
      bridgeVersion: 1,
      graphics: this.graphics,
      zeroVmOverhead: true,
    };
  }

  setTickHandler(handler: (dt: number, frame: number) => void): void {
    this.onTickCallback = handler;
  }

  enqueueCommand(cmd: WebCommand): void {
    this.commandQueue.push(cmd);
  }

  drainCommands(): WebCommand[] {
    return this.commandQueue.splice(0, this.commandQueue.length);
  }

  inputSnapshot(): WebInputSnapshot {
    return {
      keys: [...this.keysDown],
      pointer: { ...this.pointer },
      touches: [...this.touches.values()],
    };
  }

  start(): void {
    if (this.rafId != null) return;
    this.lastTimeMs = performance.now();
    const step = (now: number) => {
      this.rafId = requestAnimationFrame(step);
      if (document.hidden) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.lastTimeMs) / 1000));
      this.lastTimeMs = now;
      this.frame += 1;
      this.onTickCallback?.(dt, this.frame);
    };
    this.rafId = requestAnimationFrame(step);
  }

  stop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private resizeCanvas(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.resizeCanvas());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.audio.suspend();
    });
    window.addEventListener('keydown', (ev) => {
      this.keysDown.add(ev.code);
      this.audio.unlock();
    });
    window.addEventListener('keyup', (ev) => {
      this.keysDown.delete(ev.code);
    });
    this.canvas.addEventListener('pointerdown', (ev) => {
      this.audio.unlock();
      this.pointer.x = ev.clientX;
      this.pointer.y = ev.clientY;
      this.pointer.down = true;
      this.touches.set(ev.pointerId, { id: ev.pointerId, x: ev.clientX, y: ev.clientY, phase: 'began' });
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      this.pointer.x = ev.clientX;
      this.pointer.y = ev.clientY;
      if (this.touches.has(ev.pointerId)) {
        this.touches.set(ev.pointerId, { id: ev.pointerId, x: ev.clientX, y: ev.clientY, phase: 'moved' });
      }
    });
    const endPointer = (ev: PointerEvent, phase: 'ended' | 'cancelled') => {
      this.pointer.down = false;
      this.touches.set(ev.pointerId, { id: ev.pointerId, x: ev.clientX, y: ev.clientY, phase });
      queueMicrotask(() => this.touches.delete(ev.pointerId));
    };
    this.canvas.addEventListener('pointerup', (ev) => endPointer(ev, 'ended'));
    this.canvas.addEventListener('pointercancel', (ev) => endPointer(ev, 'cancelled'));
  }
}
