// Author: MiYu. Dock tabs retain state while suspending work in inactive panels.
import { createContext } from 'react';

export const PanelVisibilityContext = createContext(true);
