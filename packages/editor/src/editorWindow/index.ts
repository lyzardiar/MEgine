export { EditorWindow, MenuItem } from './EditorWindow';
export {
  registerMenuItem,
  registerMenuItemValidator,
  listMenuItems,
  subscribeMenuItems,
  getMenuRevision,
  openEditorWindow,
  closeEditorWindow,
  subscribeEditorWindows,
  getOpenEditorWindows,
  registerEditorWindowType,
  createRegisteredEditorWindow,
} from './registry';
export type {
  MenuItemAction,
  MenuItemContext,
  MenuItemEntry,
  MenuItemOptions,
  MenuItemSource,
  MenuItemValidate,
} from './registry';
export { EditorWindowHost } from './EditorWindowHost';
export { RegisteredEditorWindowHost } from './RegisteredEditorWindowHost';

/** Side-effect: register Window menu items */
import './windows/DecoratorGalleryWindow';
import './gameObjectMenuItems';
