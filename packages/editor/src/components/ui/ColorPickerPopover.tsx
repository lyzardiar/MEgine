import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipette } from 'lucide-react';
import { DraftNumberInput } from './DraftNumberInput';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const s = max <= 1e-6 ? 0 : d / max;
  return [h * 360, s, max];
}

export function hsvToRgb(hDeg: number, s: number, v: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 1) [r, g, b] = [c, x, 0];
  else if (h < 2) [r, g, b] = [x, c, 0];
  else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c];
  else if (h < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Number((r + m).toFixed(4)),
    Number((g + m).toFixed(4)),
    Number((b + m).toFixed(4)),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const byte = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function hexToRgbNormalized(raw: string): [number, number, number] | null {
  const clean = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [Number(r.toFixed(4)), Number(g.toFixed(4)), Number(b.toFixed(4))];
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [Number(r.toFixed(4)), Number(g.toFixed(4)), Number(b.toFixed(4))];
  }
  return null;
}

const STUDIO_SWATCHES = [
  '#ffffff', '#d4d8e2', '#7f8b9e', '#1f232a', '#000000',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
];

type BrowserEyeDropper = {
  open: () => Promise<{ sRGBHex?: string }>;
};

function createEyeDropper(): BrowserEyeDropper | null {
  const ctor = (window as unknown as { EyeDropper?: new () => BrowserEyeDropper }).EyeDropper;
  return typeof ctor === 'function' ? new ctor() : null;
}

export function ColorPickerPopover(props: {
  ariaLabel: string;
  r: number;
  g: number;
  b: number;
  a?: number;
  hasAlpha: boolean;
  disabled?: boolean;
  onChange: (next: number[]) => void;
}) {
  const r = clamp01(props.r);
  const g = clamp01(props.g);
  const b = clamp01(props.b);
  const a = clamp01(props.a ?? 1);
  const hex = rgbToHex(r, g, b);

  const [open, setOpen] = useState(false);
  const [unitMode, setUnitMode] = useState<'byte' | 'float'>('byte');
  const [hsv, setHsv] = useState<[number, number, number]>(() => rgbToHsv(r, g, b));
  const [hexDraft, setHexDraft] = useState(hex);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const svPadRef = useRef<HTMLDivElement>(null);
  const supportsEyeDropper = typeof window !== 'undefined' && typeof (window as unknown as { EyeDropper?: unknown }).EyeDropper === 'function';

  useEffect(() => {
    setHexDraft(hex.toUpperCase());
    const [nh, ns, nv] = rgbToHsv(r, g, b);
    setHsv(([prevH]) => [ns > 1e-4 ? nh : prevH, ns, nv]);
  }, [r, g, b, hex]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 264;
    const height = props.hasAlpha ? 334 : 302;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.bottom + 6 + height <= window.innerHeight - 8
      ? rect.bottom + 6
      : Math.max(8, rect.top - height - 6);
    setPos({ left, top });
  }, [open, props.hasAlpha]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (
        popoverRef.current?.contains(event.target as Node)
        || triggerRef.current?.contains(event.target as Node)
      ) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const emitRgb = (nr: number, ng: number, nb: number, na = a) => {
    if (props.disabled) return;
    props.onChange(props.hasAlpha ? [nr, ng, nb, na] : [nr, ng, nb]);
  };

  const applySvFromClient = (clientX: number, clientY: number) => {
    const pad = svPadRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const s = clamp01((clientX - rect.left) / Math.max(1, rect.width));
    const v = clamp01(1 - (clientY - rect.top) / Math.max(1, rect.height));
    setHsv(([h]) => {
      const [nr, ng, nb] = hsvToRgb(h, s, v);
      emitRgb(nr, ng, nb);
      return [h, s, v];
    });
  };

  const beginSvDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || props.disabled) return;
    event.preventDefault();
    applySvFromClient(event.clientX, event.clientY);
    const onMove = (move: PointerEvent) => applySvFromClient(move.clientX, move.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const pickWithEyeDropper = async () => {
    const dropper = createEyeDropper();
    if (!dropper) return;
    try {
      const result = await dropper.open();
      if (result.sRGBHex) {
        const parsed = hexToRgbNormalized(result.sRGBHex);
        if (parsed) emitRgb(parsed[0], parsed[1], parsed[2]);
      }
    } catch {
      // User cancelled eyedropper.
    }
  };

  const hueColor = rgbToHex(...hsvToRgb(hsv[0], 1, 1));
  const rgbCss = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  const rgbaCss = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${props.hasAlpha ? a : 1})`;
  const alphaPct = Math.round(a * 100);
  const labelSummary = props.hasAlpha && alphaPct < 100
    ? `${hex.toUpperCase()} · ${alphaPct}%`
    : hex.toUpperCase();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={props.disabled}
        className="me-color-trigger color-swatch"
        aria-label={props.ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`${hex.toUpperCase()}${props.hasAlpha ? ` · Alpha ${alphaPct}%` : ''}`}
        onClick={() => {
          if (!props.disabled) setOpen((v) => !v);
        }}
      >
        <span className="me-color-split-swatch" aria-hidden="true">
          <span className="me-color-split-solid" style={{ backgroundColor: rgbCss }} />
          <span className="me-color-split-alpha">
            <span className="me-color-split-alpha-fill" style={{ backgroundColor: rgbaCss }} />
          </span>
          {props.hasAlpha && (
            <span className="me-color-alpha-bar">
              <span className="me-color-alpha-bar-fill" style={{ width: `${alphaPct}%` }} />
            </span>
          )}
        </span>
        <span className="me-color-hex-chip">{labelSummary}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="me-color-popover"
          role="dialog"
          aria-label={`${props.ariaLabel} picker`}
          style={{ left: pos.left, top: pos.top }}
        >
          <div className="me-color-pop-head">
            <span className="me-color-pop-preview" aria-hidden="true">
              <span style={{ backgroundColor: rgbaCss }} />
            </span>
            <span className="me-color-pop-title">{labelSummary}</span>
            <div className="me-color-pop-tools">
              {supportsEyeDropper && (
                <button
                  type="button"
                  className="me-color-mini-btn"
                  title="吸管取色 / Eyedropper"
                  aria-label="Pick color from screen"
                  onClick={() => void pickWithEyeDropper()}
                >
                  <Pipette size={12} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="me-color-mini-btn"
                title="切换 0-255 / 0-1 通道数值格式"
                onClick={() => setUnitMode((m) => (m === 'byte' ? 'float' : 'byte'))}
              >
                {unitMode === 'byte' ? '0–255' : '0–1'}
              </button>
            </div>
          </div>

          <div
            ref={svPadRef}
            className="me-color-sv-pad"
            style={{ backgroundColor: hueColor }}
            onPointerDown={beginSvDrag}
          >
            <div className="me-color-sv-white" />
            <div className="me-color-sv-black" />
            <span
              className="me-color-sv-thumb"
              style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }}
            />
          </div>

          <div className="me-color-sliders">
            <label className="me-color-slider-row">
              <span>H</span>
              <input
                type="range"
                className="me-color-hue-range"
                min={0}
                max={360}
                step={1}
                value={Math.round(hsv[0])}
                onChange={(event) => {
                  const h = Number(event.target.value);
                  setHsv([h, hsv[1], hsv[2]]);
                  const [nr, ng, nb] = hsvToRgb(h, hsv[1], hsv[2]);
                  emitRgb(nr, ng, nb);
                }}
              />
            </label>
            {props.hasAlpha && (
              <label className="me-color-slider-row">
                <span>A</span>
                <span className="me-color-alpha-track-wrap">
                  <input
                    type="range"
                    className="me-color-alpha-range"
                    aria-label="Alpha slider"
                    style={{ background: `linear-gradient(to right, transparent, ${rgbCss})` }}
                    min={0}
                    max={1}
                    step={0.01}
                    value={a}
                    onChange={(event) => emitRgb(r, g, b, clamp01(Number(event.target.value)))}
                  />
                </span>
              </label>
            )}
          </div>

          <div className={`me-color-inputs${props.hasAlpha ? ' has-alpha' : ''}`}>
            <label className="me-color-channel-box">
              <input
                type="text"
                className="me-color-hex-input"
                aria-label="Hex color"
                value={hexDraft}
                spellCheck={false}
                onChange={(event) => setHexDraft(event.target.value)}
                onBlur={() => {
                  const parsed = hexToRgbNormalized(hexDraft);
                  if (parsed) emitRgb(parsed[0], parsed[1], parsed[2]);
                  else setHexDraft(hex.toUpperCase());
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    const parsed = hexToRgbNormalized(hexDraft);
                    if (parsed) emitRgb(parsed[0], parsed[1], parsed[2]);
                    else setHexDraft(hex.toUpperCase());
                    event.currentTarget.blur();
                  }
                }}
              />
              <span>HEX</span>
            </label>
            <label className="me-color-channel-box">
              <DraftNumberInput
                value={unitMode === 'byte' ? Math.round(r * 255) : Number(r.toFixed(3))}
                min={0}
                max={unitMode === 'byte' ? 255 : 1}
                step={unitMode === 'byte' ? 1 : 0.01}
                precision={unitMode === 'byte' ? 0 : 3}
                ariaLabel="Red channel"
                onChange={(val) => emitRgb(clamp01(unitMode === 'byte' ? val / 255 : val), g, b)}
              />
              <span>R</span>
            </label>
            <label className="me-color-channel-box">
              <DraftNumberInput
                value={unitMode === 'byte' ? Math.round(g * 255) : Number(g.toFixed(3))}
                min={0}
                max={unitMode === 'byte' ? 255 : 1}
                step={unitMode === 'byte' ? 1 : 0.01}
                precision={unitMode === 'byte' ? 0 : 3}
                ariaLabel="Green channel"
                onChange={(val) => emitRgb(r, clamp01(unitMode === 'byte' ? val / 255 : val), b)}
              />
              <span>G</span>
            </label>
            <label className="me-color-channel-box">
              <DraftNumberInput
                value={unitMode === 'byte' ? Math.round(b * 255) : Number(b.toFixed(3))}
                min={0}
                max={unitMode === 'byte' ? 255 : 1}
                step={unitMode === 'byte' ? 1 : 0.01}
                precision={unitMode === 'byte' ? 0 : 3}
                ariaLabel="Blue channel"
                onChange={(val) => emitRgb(r, g, clamp01(unitMode === 'byte' ? val / 255 : val))}
              />
              <span>B</span>
            </label>
            {props.hasAlpha && (
              <label className="me-color-channel-box">
                <DraftNumberInput
                  value={unitMode === 'byte' ? Math.round(a * 255) : Number(a.toFixed(3))}
                  min={0}
                  max={unitMode === 'byte' ? 255 : 1}
                  step={unitMode === 'byte' ? 1 : 0.01}
                  precision={unitMode === 'byte' ? 0 : 3}
                  ariaLabel="Alpha channel"
                  onChange={(val) => emitRgb(r, g, b, clamp01(unitMode === 'byte' ? val / 255 : val))}
                />
                <span>A</span>
              </label>
            )}
          </div>

          <div className="me-color-swatches">
            {STUDIO_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className="me-color-swatch-dot"
                style={{ backgroundColor: swatch }}
                title={swatch}
                aria-label={`Select color ${swatch}`}
                onClick={() => {
                  const parsed = hexToRgbNormalized(swatch);
                  if (parsed) emitRgb(parsed[0], parsed[1], parsed[2]);
                }}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
