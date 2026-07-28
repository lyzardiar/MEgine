import type { ReactNode } from 'react';
import {
  createRegisteredEditorWindow,
  openEditorWindow,
  registerMenuItem,
  registerMenuItemValidator,
  type MenuItemContext,
  type MenuItemOptions,
} from './registry';
import { openNativeEditorWindow } from './nativeEditorWindow';

export type EditorWindowOptions = {
  /** Stable id — same id reopens/focuses one instance (Unity GetWindow). */
  id?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  /** Keep the native window hidden and unfocused for background Agent work. */
  activateWindow?: boolean;
};

/**
 * Unity-like custom editor window.
 * Subclass, implement `title` + `onGUI()`, open via `YourWindow.show()` or `@MenuItem`.
 * Register a module-load factory with `registerEditorWindowType` when the window
 * must be detachable and discoverable from independent WebViews or Agents.
 */
export abstract class EditorWindow {
  abstract title: string;
  minWidth = 360;
  minHeight = 280;

  /** Build window body (React). Called each host render. */
  abstract onGUI(): ReactNode;

  /** Open / focus this window type (single instance per class name by default). */
  static show<T extends EditorWindow>(
    this: new () => T,
    opts: EditorWindowOptions = {},
  ): void {
    const inst = new this();
    const id = opts.id ?? `EditorWindow.${this.name}`;
    const width = Math.max(inst.minWidth, opts.width ?? 420);
    const height = Math.max(inst.minHeight, opts.height ?? 480);
    const x = opts.x ?? Math.max(40, (window.innerWidth - width) / 2 - 40);
    const y = opts.y ?? Math.max(60, (window.innerHeight - height) / 2 - 40);
    const definition = () => {
      const current = new this();
      return {
        typeId: id,
        title: current.title,
        width,
        height,
        render: () => current.onGUI(),
      };
    };
    if (!createRegisteredEditorWindow(id)) {
      openEditorWindow({
        id,
        title: inst.title,
        x,
        y,
        width,
        height,
        render: () => inst.onGUI(),
      });
      return;
    }
    void openNativeEditorWindow({
      typeId: id,
      title: inst.title,
      width,
      height,
      activateWindow: opts.activateWindow,
    }).then((opened) => {
      if (opened) return;
      const fallback = definition();
      openEditorWindow({
        id,
        title: fallback.title,
        x,
        y,
        width,
        height,
        render: fallback.render,
      });
    });
  }
}

/**
 * Register a static method under a Unity-style menu path.
 * Prefer registering from `.ts` files (esbuild + experimentalDecorators).
 * In `.tsx` (Babel), call `registerMenuItem(path, fn)` instead.
 *
 * Example:
 * ```ts
 * class MyWin extends EditorWindow {
 *   @MenuItem('Window/My Win', { priority: 100, agentInvokable: true })
 *   static open() { MyWin.show(); }
 * }
 * ```
 * Menu commands are unavailable to Agents unless they explicitly opt in.
 */
export function MenuItem(
  path: string,
  validateOrOptions: boolean | MenuItemOptions = false,
  priority = 1000,
) {
  return (target: unknown, key?: string, descriptor?: PropertyDescriptor) => {
    const method =
      descriptor && typeof descriptor.value === 'function'
        ? descriptor.value as (context: MenuItemContext) => unknown
        : typeof target === 'function'
          ? target as (context: MenuItemContext) => unknown
          : null;
    if (!method) {
      console.warn(`[MenuItem] ${path}: expected static method`);
      return;
    }
    if (validateOrOptions === true) {
      registerMenuItemValidator(path, (context) => Boolean(method.call(target, context)));
      return;
    }
    const options =
      typeof validateOrOptions === 'object'
        ? validateOrOptions
        : { priority };
    registerMenuItem(path, (context) => {
      const result = method.call(target, context);
      return result instanceof Promise ? result.then(() => undefined) : undefined;
    }, options);
  };
}
