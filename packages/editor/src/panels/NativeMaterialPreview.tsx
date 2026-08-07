import { invoke } from '@tauri-apps/api/core';
import { RotateCcw } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import type { MaterialAsset } from '../materialAsset';
import { isDesktopEditor } from '../transport/editorTransport';

type NativeViewportFrame = {
  width: number;
  height: number;
  pngBase64: string;
};

const DEFAULT_CAMERA = { yaw: 145, pitch: 22, distance: 4.2 };
const BACKGROUND: [number, number, number, number] = [0.075, 0.08, 0.095, 1];

export function NativeMaterialPreview(props: {
  material: MaterialAsset;
  label: string;
}) {
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [frame, setFrame] = useState<NativeViewportFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 480, height: 260 });
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.max(160, Math.min(960, Math.round(entry.contentRect.width))),
        height: Math.max(140, Math.min(600, Math.round(entry.contentRect.height))),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isDesktopEditor()) return;
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => {
      void invoke<NativeViewportFrame>('render_material_preview', {
        request: {
          material: props.material,
          width: size.width,
          height: size.height,
          cameraYaw: camera.yaw,
          cameraPitch: camera.pitch,
          cameraDistance: camera.distance,
          background: BACKGROUND,
        },
      }).then((next) => {
        if (requestRef.current !== requestId) return;
        setFrame(next);
        setError(null);
      }).catch((reason) => {
        if (requestRef.current !== requestId) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    }, 100);
    return () => {
      window.clearTimeout(timer);
      if (requestRef.current === requestId) requestRef.current += 1;
    };
  }, [camera, props.material, size]);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setCamera((current) => ({
      ...current,
      yaw: current.yaw - dx * 0.35,
      pitch: Math.max(-80, Math.min(80, current.pitch + dy * 0.35)),
    }));
  };

  return (
    <div className="material-preview">
      <div
        ref={stageRef}
        className="material-preview-frame"
        aria-label="Native material preview"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          setCamera((current) => ({
            ...current,
            distance: Math.max(1.5, Math.min(20, current.distance * Math.exp(event.deltaY * 0.001))),
          }));
        }}
      >
        {frame && (
          <img
            src={`data:image/png;base64,${frame.pngBase64}`}
            alt={props.label}
            draggable={false}
          />
        )}
        {!frame && !error && (
          <span className="material-preview-status">
            {isDesktopEditor() ? 'Rendering native preview...' : 'Native preview requires the desktop editor'}
          </span>
        )}
        {error && <span className="material-preview-error">{error}</span>}
        <span className="material-preview-badge">Native RHI</span>
        <button
          type="button"
          className="material-preview-reset"
          aria-label="Reset preview camera"
          title="Reset preview camera"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setCamera(DEFAULT_CAMERA)}
        >
          <RotateCcw size={13} />
        </button>
      </div>
      <span>{props.label}</span>
    </div>
  );
}
