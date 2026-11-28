import { useSyncExternalStore } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
};

let nextToastId = 1;
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function pushToast(
  message: string,
  kind: ToastKind = 'info',
  durationMs = 2600,
): number {
  const id = nextToastId++;
  toasts = [...toasts.slice(-3), { id, kind, message }];
  notify();
  if (typeof window !== 'undefined' && durationMs > 0) {
    window.setTimeout(() => dismissToast(id), durationMs);
  }
  return id;
}

export function dismissToast(id: number): void {
  const next = toasts.filter((item) => item.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    notify();
  }
}

function getToasts(): ToastItem[] {
  return toasts;
}

function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function ToastHost() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, () => []);
  if (items.length === 0) return null;
  return (
    <div className="me-toast-host" role="region" aria-label="Notifications" aria-live="polite">
      {items.map((item) => {
        const Icon = item.kind === 'success'
          ? CheckCircle2
          : item.kind === 'warn'
            ? AlertTriangle
            : item.kind === 'error'
              ? AlertCircle
              : Info;
        return (
          <div
            key={item.id}
            className={`me-toast is-${item.kind}`}
            role="status"
            onClick={() => dismissToast(item.id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}
