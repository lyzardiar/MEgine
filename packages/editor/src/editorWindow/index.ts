export { EditorWindow, MenuItem } from './EditorWindow';
export {
  registerMenuItem,
  registerMenuItemValidator,
  listMenuItems,
  listAllMenuItems,
  findMenuItem,
  subscribeMenuItems,
  getMenuRevision,
  openEditorWindow,
  closeEditorWindow,
  subscribeEditorWindows,
  getOpenEditorWindows,
  registerEditorWindowType,
  createRegisteredEditorWindow,
  listRegisteredEditorWindowTypes,
  subscribeEditorWindowTypes,
  getEditorWindowTypeRevision,
} from './registry';
export type {
  MenuItemAction,
  MenuItemContext,
  MenuItemEntry,
  MenuItemOptions,
  MenuItemSource,
  MenuItemValidate,
  EditorWindowTypeInfo,
} from './registry';
export { EditorWindowHost } from './EditorWindowHost';
export { RegisteredEditorWindowHost } from './RegisteredEditorWindowHost';

/** Side-effect: register Window menu items */
import './windows/DecoratorGalleryWindow';
import './windows/DocumentationWindow';
import './assetMenuItems';
import './assetImportMenuItem';
import './componentMenuItems';
import './gameObjectMenuItems';
import './prefabMenuItems';
