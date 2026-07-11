export { EditorWindow, MenuItem } from './EditorWindow';
export {
  registerMenuItem,
  listMenuItems,
  openEditorWindow,
  closeEditorWindow,
  subscribeEditorWindows,
  getOpenEditorWindows,
} from './registry';
export { EditorWindowHost } from './EditorWindowHost';

/** Side-effect: register Window menu items */
import './windows/DecoratorGalleryWindow';
