import type { ReactNode } from 'react';
import {
  openEditorWindow,
  registerEditorWindowType,
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
};

/**
 * Unity-like custom editor window.
 * Subclass, implement `title` + `onGUI()`, open via `YourWindow.show()` or `@MenuItem`.
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
    registerEditorWindowType(id, definition);
    void openNativeEditorWindow({ typeId: id, title: inst.title, width, height }).then((opened) => {
      if (opened) return;
      openEditorWindow({
      id,
      title: inst.title,
      x,
      y,
      width,
      height,
      render: () => inst.onGUI(),
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
 *   @MenuItem('Window/My Win', false, 100)
 *   static open() { MyWin.show(); }
 * }
 * ```
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
