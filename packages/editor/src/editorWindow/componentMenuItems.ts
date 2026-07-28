import { getComponentCatalog } from '../componentCatalog.ts';
import { registerMenuItem, type MenuItemContext } from './registry.ts';

const COMPONENT_GROUPS: Record<string, string> = {
  Camera3D: 'Camera',
  Camera2D: 'Camera',
  DirectionalLight: 'Lighting',
  EnvironmentLight: 'Lighting',
  PointLight: 'Lighting',
  SpotLight: 'Lighting',
  Light2D: 'Lighting',
  RigidBody3D: 'Physics 3D',
  BoxCollider3D: 'Physics 3D',
  SphereCollider3D: 'Physics 3D',
  Rigidbody2D: 'Physics 2D',
  BoxCollider2D: 'Physics 2D',
  CircleCollider2D: 'Physics 2D',
  MeshRenderer: 'Rendering',
  PbrMaterial: 'Rendering',
  MaterialPropertyBlock: 'Rendering',
  SpriteRenderer: 'Rendering',
  AnimatedSprite2D: 'Rendering',
  Line2D: 'Rendering',
  Grid: 'Rendering',
  Tilemap: 'Rendering',
  SpineSkeleton: 'Rendering',
  Canvas: 'UI/Layout',
  CanvasScaler: 'UI/Layout',
  RectTransform: 'UI/Layout',
  AspectRatioFitter: 'UI/Layout',
  ContentSizeFitter: 'UI/Layout',
  CanvasGroup: 'UI/Layout',
  LayoutGroup: 'UI/Layout',
  RectMask2D: 'UI/Layout',
  Image: 'UI/Visual',
  RawImage: 'UI/Visual',
  Text: 'UI/Visual',
  Panel: 'UI/Visual',
  Shadow: 'UI/Visual',
  Outline: 'UI/Visual',
  Button: 'UI/Interaction',
  ToggleGroup: 'UI/Interaction',
  Toggle: 'UI/Interaction',
  Slider: 'UI/Interaction',
  Scrollbar: 'UI/Interaction',
  ProgressBar: 'UI/Interaction',
  InputField: 'UI/Interaction',
  Dropdown: 'UI/Interaction',
  ListView: 'UI/Interaction',
  ScrollView: 'UI/Interaction',
  TabView: 'UI/Interaction',
  AnimationPlayer: 'Animation',
  Animator: 'Animation',
  TimelineDirector: 'Animation',
  AudioListener: 'Audio',
  AudioSource: 'Audio',
  AudioMixer: 'Audio',
  ParticleEmitter2D: 'Effects',
  ParticleEmitter3D: 'Effects',
};

function targetEntity(context: MenuItemContext) {
  const entityId = context.contextEntity ?? context.store.selected;
  if (entityId == null) return null;
  return context.store.snapshot().entities.find((entity) => entity.entity === entityId) ?? null;
}

const catalog = getComponentCatalog();
const duplicateLabels = new Set(
  catalog
    .filter((entry, index, entries) => (
      entries.findIndex((candidate) => candidate.label === entry.label) !== index
    ))
    .map((entry) => entry.label),
);

catalog.forEach((entry, index) => {
  const label = duplicateLabels.has(entry.label)
    ? `${entry.label} (${entry.type})`
    : entry.label;
  const group = COMPONENT_GROUPS[entry.type] ?? 'Scripts';
  const path = `Component/${group}/${label}`;
  registerMenuItem(
    path,
    (context) => {
      const entity = targetEntity(context);
      if (!entity) return;
      if (!context.store.addComponent(entity.entity, entry.type, entry.create())) return;
      context.log(`Added ${entry.type}`);
      context.refresh();
    },
    {
      priority: 100 + index,
      validate: (context) => {
        const entity = targetEntity(context);
        return context.store.mode === 'edit' && entity != null
          && entity.components[entry.type] == null;
      },
    },
  );
});
