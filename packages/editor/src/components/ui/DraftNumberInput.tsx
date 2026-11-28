import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Safely evaluates simple arithmetic expressions such as "1920/2", "360*0.5",
 * "-12.5 + 4", or "(100-20)/4" without invoking eval() or Function().
 */
export function evaluateNumericExpression(raw: string): number | null {
  const input = raw.trim();
  if (!input) return null;
  const direct = Number(input);
  if (Number.isFinite(direct)) return direct;
  if (!/^[0-9eE.+\-*/()\s]+$/.test(input)) return null;

  let index = 0;
  const skipSpaces = () => {
    while (index < input.length && /\s/.test(input[index])) index += 1;
  };

  const parseExpression = (): number | null => {
    let left = parseTerm();
    if (left == null) return null;
    while (true) {
      skipSpaces();
      const ch = input[index];
      if (ch !== '+' && ch !== '-') break;
      index += 1;
      const right = parseTerm();
      if (right == null) return null;
      left = ch === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left == null) return null;
    while (true) {
      skipSpaces();
      const ch = input[index];
      if (ch !== '*' && ch !== '/') break;
      index += 1;
      const right = parseFactor();
      if (right == null) return null;
      if (ch === '/') {
        if (right === 0) return null;
        left /= right;
      } else {
        left *= right;
      }
    }
    return left;
  };

  const parseFactor = (): number | null => {
    skipSpaces();
    const ch = input[index];
    if (ch === '+') {
      index += 1;
      return parseFactor();
    }
    if (ch === '-') {
      index += 1;
      const inner = parseFactor();
      return inner == null ? null : -inner;
    }
    if (ch === '(') {
      index += 1;
      const inner = parseExpression();
      skipSpaces();
      if (inner == null || input[index] !== ')') return null;
      index += 1;
      return inner;
    }
    const start = index;
    while (index < input.length && /[0-9.]/.test(input[index])) index += 1;
    if (index < input.length && (input[index] === 'e' || input[index] === 'E')) {
      index += 1;
      if (input[index] === '+' || input[index] === '-') index += 1;
      while (index < input.length && /[0-9]/.test(input[index])) index += 1;
    }
    if (index === start) return null;
    const parsed = Number(input.slice(start, index));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const result = parseExpression();
  skipSpaces();
  if (result == null || index !== input.length || !Number.isFinite(result)) return null;
  return result;
}

export function formatNumericDraft(value: number, precision = 3): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/**
 * On-demand scrub drag hook: attaches window listeners ONLY during an active
 * drag gesture and removes them immediately on pointerup/cancel/unmount.
 */
export function useOnDemandScrubDrag(options: {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  onBegin?: () => void;
  onEnd?: () => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    cleanupRef.current?.();

    const startX = event.clientX;
    const startValue = latest.current.value;
    const baseStep = latest.current.step ?? 0.05;
    latest.current.onBegin?.();
    document.body.classList.add('insp-scrubbing');

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const scale = moveEvent.shiftKey ? 0.1 : moveEvent.altKey ? 10 : 1;
      let next = startValue + dx * baseStep * scale;
      if (moveEvent.ctrlKey) {
        const snap = Math.max(baseStep, 0.25);
        next = Math.round(next / snap) * snap;
      }
      if (latest.current.min != null) next = Math.max(latest.current.min, next);
      if (latest.current.max != null) next = Math.min(latest.current.max, next);
      latest.current.onChange(Number(next.toFixed(4)));
    };

    const finish = () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      latest.current.onEnd?.();
    };

    const cleanup = () => {
      document.body.classList.remove('insp-scrubbing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    };
    cleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
  };

  return { onPointerDown };
}

export function DraftNumberInput(props: {
  value: number;
  mixed?: boolean;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  onChange: (value: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() =>
    props.mixed ? '' : formatNumericDraft(props.value, props.precision),
  );

  useEffect(() => {
    if (!focused) {
      setDraft(props.mixed ? '' : formatNumericDraft(props.value, props.precision));
    }
  }, [focused, props.mixed, props.precision, props.value]);

  const commit = (raw: string) => {
    const evaluated = evaluateNumericExpression(raw);
    if (evaluated == null) {
      setDraft(props.mixed ? '' : formatNumericDraft(props.value, props.precision));
      return;
    }
    let next = evaluated;
    if (props.min != null) next = Math.max(props.min, next);
    if (props.max != null) next = Math.min(props.max, next);
    props.onChange(next);
    setDraft(formatNumericDraft(next, props.precision));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(draft);
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(props.mixed ? '' : formatNumericDraft(props.value, props.precision));
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const base = evaluateNumericExpression(draft) ?? props.value;
      const delta = (props.step ?? 1) * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1);
      const next = base + (event.key === 'ArrowUp' ? delta : -delta);
      const clamped = props.min != null && next < props.min
        ? props.min
        : props.max != null && next > props.max
          ? props.max
          : next;
      props.onChange(Number(clamped.toFixed(4)));
      setDraft(formatNumericDraft(clamped, props.precision));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`me-num-input${props.className ? ` ${props.className}` : ''}`}
      value={draft}
      placeholder={props.mixed ? '—' : undefined}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onFocus={(event) => {
        setFocused(true);
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onKeyDown={onKeyDown}
    />
  );
}
