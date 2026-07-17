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
createItem('2D Object/Sprite', 124, ({ store }) => store.spawnSpriteQuad());
createItem('2D Object/Animated Sprite', 125, ({ store }) => store.spawnAnimatedSprite2D());
createItem('2D Object/Line 2D', 126, ({ store }) => store.spawnLine2D());
createItem('Effects/Particle System 3D', 120, ({ store }) => store.spawnParticleEmitter3D());
createItem('Effects/Particle System 2D', 121, ({ store }) => store.spawnParticleEmitter2D());
createItem('2D Object/Spine Skeleton', 130, ({ store }) => store.spawnSpineSkeleton());
createItem('Camera/Camera 3D', 200, ({ store }) => store.spawnCamera());
createItem('Camera/Camera 2D', 201, ({ store }) => store.spawnCamera2D());
createItem('Light/Directional', 210, ({ store }) => store.spawnDirectionalLight());
createItem('Light/Point', 211, ({ store }) => store.spawnPointLight());
createItem('Light/Spot', 212, ({ store }) => store.spawnSpotLight());
createItem('Audio/Audio Source', 220, ({ store }) => store.spawnAudioSource());
createItem('Audio/Audio Listener', 221, ({ store }) => store.spawnAudioListener());
createItem('Audio/Audio Mixer', 222, ({ store }) => store.spawnAudioMixer());

createItem('UI/Canvas', 300, ({ store }) => store.spawnUiCanvas(), { separatorBefore: true });
createItem('UI/Image', 310, ({ store }) => store.spawnUiImage());
createItem('UI/Raw Image', 311, ({ store }) => store.spawnUiRawImage());
createItem('UI/Button', 312, ({ store }) => store.spawnUiButton());
createItem('UI/Text', 313, ({ store }) => store.spawnUiText());
createItem('UI/Toggle', 314, ({ store }) => store.spawnUiToggle());
createItem('UI/Slider', 315, ({ store }) => store.spawnUiSlider());
createItem('UI/Scrollbar', 316, ({ store }) => store.spawnUiScrollbar());
createItem('UI/Progress Bar', 317, ({ store }) => store.spawnUiProgressBar());
createItem('UI/Input Field', 318, ({ store }) => store.spawnUiInputField());
createItem('UI/Dropdown', 319, ({ store }) => store.spawnUiDropdown());
createItem('UI/List View', 320, ({ store }) => store.spawnUiListView());
createItem('UI/Scroll View', 321, ({ store }) => store.spawnUiScrollView());
createItem('UI/Tab View', 322, ({ store }) => store.spawnUiTabView());
createItem('UI/Panel', 400, ({ store }) => store.spawnUiPanel(), { separatorBefore: true });
createItem('UI/Layout Group', 410, ({ store }) => store.spawnUiLayoutGroup());
