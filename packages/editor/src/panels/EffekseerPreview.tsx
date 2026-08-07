import { invoke } from '@tauri-apps/api/core';
import {
  Camera,
  CirclePause,
  CirclePlay,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import {
  PROJECT_ASSETS_CHANGED_EVENT,
  PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT,
} from '../assetEditorEvents';
import { refreshProjectFiles, type ProjectFileAsset } from '../projectAssets';
import { isDesktopEditor } from '../transport/editorTransport';

type NativeViewportFrame = {
  width: number;
  height: number;
  pngBase64: string;
};

type CameraPreset = 'front' | 'quarter' | 'top';
type RenderMode = 'world' | 'screen';

const CAMERA_PRESETS: Record<CameraPreset, { yaw: number; pitch: number }> = {
  front: { yaw: 180, pitch: 0 },
  quarter: { yaw: 145, pitch: 20 },
  top: { yaw: 180, pitch: 80 },
};

const BACKGROUNDS = [
  { name: 'Dark', value: [0.035, 0.04, 0.055, 1] as [number, number, number, number], css: '#090a0e' },
  { name: 'Gray', value: [0.18, 0.19, 0.21, 1] as [number, number, number, number], css: '#303236' },
  { name: 'Light', value: [0.72, 0.74, 0.78, 1] as [number, number, number, number], css: '#b8bdc7' },
];

export function EffekseerPreview(props: {
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
}) {
  const [assets, setAssets] = useState<ProjectFileAsset[]>([]);
  const [playing, setPlaying] = useState(true);
  const [looping, setLooping] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [restart, setRestart] = useState(0);
  const [camera, setCamera] = useState({ yaw: 145, pitch: 20, distance: 8 });
  const [renderMode, setRenderMode] = useState<RenderMode>('world');
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [frame, setFrame] = useState<NativeViewportFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 960, height: 540 });
  const stageRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef({ inFlight: false, generation: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const selected = useMemo(
    () => assets.find((asset) => asset.relPath === props.selectedPath) ?? null,
    [assets, props.selectedPath],
  );

  useEffect(() => {
    let active = true;
    const load = () => {
      void refreshProjectFiles().then((files) => {
        if (!active) return;
        const effects = files
          .filter((asset) => asset.kind === 'effekseer-effect')
          .sort((left, right) => left.relPath.localeCompare(right.relPath));
        setAssets(effects);
        if (!props.selectedPath && effects[0]) props.onSelectPath(effects[0].relPath);
      });
    };
    load();
    window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, load);
    window.addEventListener(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, load);
      window.removeEventListener(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, load);
    };
  }, [props.onSelectPath, props.selectedPath]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.max(1, Math.min(1600, Math.round(entry.contentRect.width))),
        height: Math.max(1, Math.min(1000, Math.round(entry.contentRect.height))),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selected || !isDesktopEditor()) {
      setFrame(null);
      return;
    }
    const request = requestRef.current;
    const generation = ++request.generation;
    let cancelled = false;
    const render = () => {
      if (cancelled || request.inFlight) return;
      request.inFlight = true;
      void invoke<NativeViewportFrame>('render_effekseer_preview', {
        request: {
          effect: selected.relPath,
          width: size.width,
          height: size.height,
          playing,
          looping,
          speed,
          restart,
          cameraYaw: camera.yaw,
          cameraPitch: camera.pitch,
          cameraDistance: camera.distance,
          renderMode,
          background: background.value,
        },
      }).then((next) => {
        if (!cancelled && request.generation === generation) {
          setFrame(next);
          setError(null);
        }
      }).catch((reason) => {
        if (!cancelled && request.generation === generation) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }).finally(() => {
        request.inFlight = false;
      });
    };
    render();
    const timer = window.setInterval(render, playing ? 80 : 300);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [background, camera, looping, playing, renderMode, restart, selected, size, speed]);

  const chooseCamera = (preset: CameraPreset) => {
    setCamera((current) => ({ ...current, ...CAMERA_PRESETS[preset] }));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setCamera((current) => ({
      ...current,
      yaw: current.yaw - dx * 0.35,
      pitch: Math.max(-89, Math.min(89, current.pitch + dy * 0.35)),
    }));
  };

  return (
    <div className="effekseer-preview-layout">
      <aside className="effekseer-preview-assets" aria-label="Effekseer effects">
        <div className="effekseer-preview-assets-title">
          <span>Effects</span>
          <span>{assets.length}</span>
        </div>
        <div className="effekseer-preview-asset-list">
          {assets.map((asset) => (
            <button
              key={asset.relPath}
              type="button"
              className={selected?.relPath === asset.relPath ? 'active' : ''}
              title={asset.relPath}
              onClick={() => {
                props.onSelectPath(asset.relPath);
                setPlaying(true);
                setRestart((value) => value + 1);
              }}
            >
              <span>{asset.name}</span>
              <small>{asset.folder.replace(/^Assets\/?/, '') || 'Assets'}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="effekseer-preview-main">
        <div
          ref={stageRef}
          className="effekseer-preview-stage"
          onPointerDown={(event) => {
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => {
            dragRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onWheel={(event) => {
            event.preventDefault();
            setCamera((current) => ({
              ...current,
              distance: Math.max(0.25, Math.min(100, current.distance * Math.exp(event.deltaY * 0.001))),
            }));
          }}
        >
          {frame && (
            <img
              src={`data:image/png;base64,${frame.pngBase64}`}
              alt={selected?.name ?? 'Effekseer preview'}
              draggable={false}
            />
          )}
          {!selected && <div className="effekseer-preview-empty">No Effekseer effects</div>}
          {error && <div className="effekseer-preview-error">{error}</div>}
        </div>

        <div className="effekseer-preview-controls">
          <button
            type="button"
            className="icon-button"
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!selected}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? <CirclePause size={17} /> : <CirclePlay size={17} />}
          </button>
          <button
            type="button"
            className="icon-button"
            title="Restart"
            aria-label="Restart"
            disabled={!selected}
            onClick={() => {
              setPlaying(true);
              setRestart((value) => value + 1);
            }}
          >
            <RotateCcw size={17} />
          </button>
          <label className="effekseer-preview-toggle">
            <input type="checkbox" checked={looping} onChange={(event) => setLooping(event.target.checked)} />
            <RefreshCw size={14} />
            <span>Loop</span>
          </label>
          <label className="effekseer-preview-speed">
            <span>{speed.toFixed(2)}x</span>
            <input
              type="range"
              min="0"
              max="4"
              step="0.05"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            />
          </label>
          <div className="effekseer-preview-segment" aria-label="Render mode">
            {(['world', 'screen'] as RenderMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={renderMode === mode ? 'active' : ''}
                aria-pressed={renderMode === mode}
                title={mode === 'world' ? '3D world preview' : '2D UI overlay preview'}
                onClick={() => setRenderMode(mode)}
              >
                <span>{mode === 'world' ? '3D' : '2D / UI'}</span>
              </button>
            ))}
          </div>
          <div className="effekseer-preview-segment" aria-label="Camera preset">
            {(['front', 'quarter', 'top'] as CameraPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                title={`${preset} camera`}
                disabled={renderMode === 'screen'}
                onClick={() => chooseCamera(preset)}
              >
                <Camera size={14} />
                <span>{preset === 'quarter' ? '3/4' : preset}</span>
              </button>
            ))}
          </div>
          <div className="effekseer-preview-backgrounds" aria-label="Background">
            {BACKGROUNDS.map((item) => (
              <button
                key={item.name}
                type="button"
                className={background.name === item.name ? 'active' : ''}
                title={`${item.name} background`}
                aria-label={`${item.name} background`}
                style={{ '--preview-swatch': item.css } as CSSProperties}
                onClick={() => setBackground(item)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
