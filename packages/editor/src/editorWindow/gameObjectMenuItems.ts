import { registerMenuItem, type MenuItemContext, type MenuItemOptions } from './registry';

type CreateAction = (context: MenuItemContext) => unknown;

function createItem(
  relativePath: string,
  priority: number,
  create: CreateAction,
  options: Omit<MenuItemOptions, 'priority'> = {},
) {
  const path = `GameObject/${relativePath}`;
  registerMenuItem(
    path,
    (context) => {
      create(context);
      context.log(path);
      context.refresh();
    },
    { ...options, priority },
  );
}

createItem('Create Empty', 0, ({ store }) => store.createEmpty(null));
createItem('Create Empty Child', 1, ({ store }) => store.createEmptyChild());

createItem(
  '3D Object/Cube',
  100,
  ({ source, store }) => {
    if (source === 'hierarchy' && store.selected != null) store.spawnCubeChild();
    else store.spawnPrefab('Cube');
  },
  { separatorBefore: true },
);
createItem('3D Object/Sprite Quad', 110, ({ store }) => store.spawnSpriteQuad());
createItem('Effects/Particle System 3D', 120, ({ store }) => store.spawnParticleEmitter3D());
createItem('Effects/Particle System 2D', 121, ({ store }) => store.spawnParticleEmitter2D());
createItem('2D Object/Spine Skeleton', 130, ({ store }) => store.spawnSpineSkeleton());
createItem('Camera/Camera 3D', 200, ({ store }) => store.spawnCamera());
createItem('Camera/Camera 2D', 201, ({ store }) => store.spawnCamera2D());
createItem('Light/Directional', 210, ({ store }) => store.spawnDirectionalLight());
createItem('Light/Point', 211, ({ store }) => store.spawnPointLight());
createItem('Light/Spot', 212, ({ store }) => store.spawnSpotLight());

createItem('UI/Canvas', 300, ({ store }) => store.spawnUiCanvas(), { separatorBefore: true });
createItem('UI/Image', 310, ({ store }) => store.spawnUiImage());
createItem('UI/Button', 311, ({ store }) => store.spawnUiButton());
createItem('UI/Text', 312, ({ store }) => store.spawnUiText());
createItem('UI/Toggle', 313, ({ store }) => store.spawnUiToggle());
createItem('UI/Slider', 314, ({ store }) => store.spawnUiSlider());
createItem('UI/Scrollbar', 315, ({ store }) => store.spawnUiScrollbar());
createItem('UI/Progress Bar', 316, ({ store }) => store.spawnUiProgressBar());
createItem('UI/Input Field', 317, ({ store }) => store.spawnUiInputField());
createItem('UI/Dropdown', 318, ({ store }) => store.spawnUiDropdown());
createItem('UI/List View', 319, ({ store }) => store.spawnUiListView());
createItem('UI/Scroll View', 320, ({ store }) => store.spawnUiScrollView());
createItem('UI/Tab View', 321, ({ store }) => store.spawnUiTabView());
createItem('UI/Panel', 400, ({ store }) => store.spawnUiPanel(), { separatorBefore: true });
createItem('UI/Layout Group', 410, ({ store }) => store.spawnUiLayoutGroup());
