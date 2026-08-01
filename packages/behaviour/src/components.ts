import type { SerializedComponentMap } from '@mengine/api';

/** Constructor token used as a strongly typed key: ctx.get(Transform). */
export type ComponentType<T = unknown> = {
  readonly typeName: string;
  new (...args: never[]): T;
};

export function componentTypeName(key: string | ComponentType): string {
  if (typeof key === 'string') return key;
  return key.typeName || key.name;
}

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Color4 = [number, number, number, number];
export type BuiltinComponents = SerializedComponentMap;
export type BuiltinComponentName = keyof BuiltinComponents;

function defineBuiltinComponent<K extends BuiltinComponentName>(
  typeName: K,
): ComponentType<BuiltinComponents[K]> & { readonly typeName: K } {
  return class {
    static readonly typeName = typeName;
  } as unknown as ComponentType<BuiltinComponents[K]> & { readonly typeName: K };
}

export const Name = defineBuiltinComponent('Name');
export type Name = BuiltinComponents['Name'];
export const Transform = defineBuiltinComponent('Transform');
export type Transform = BuiltinComponents['Transform'];
export type TransformData = Transform;
export const Transform2D = defineBuiltinComponent('Transform2D');
export type Transform2D = BuiltinComponents['Transform2D'];
export const Camera3D = defineBuiltinComponent('Camera3D');
export type Camera3D = BuiltinComponents['Camera3D'];
export type Camera3DData = Camera3D;
export const DirectionalLight = defineBuiltinComponent('DirectionalLight');
export type DirectionalLight = BuiltinComponents['DirectionalLight'];
export const EnvironmentLight = defineBuiltinComponent('EnvironmentLight');
export type EnvironmentLight = BuiltinComponents['EnvironmentLight'];
export const PointLight = defineBuiltinComponent('PointLight');
export type PointLight = BuiltinComponents['PointLight'];
export const SpotLight = defineBuiltinComponent('SpotLight');
export type SpotLight = BuiltinComponents['SpotLight'];
export const Light2D = defineBuiltinComponent('Light2D');
export type Light2D = BuiltinComponents['Light2D'];
export const Camera2D = defineBuiltinComponent('Camera2D');
export type Camera2D = BuiltinComponents['Camera2D'];
export type Camera2DData = Camera2D;
export const MeshRenderer = defineBuiltinComponent('MeshRenderer');
export type MeshRenderer = BuiltinComponents['MeshRenderer'];
export const PbrMaterial = defineBuiltinComponent('PbrMaterial');
export type PbrMaterial = BuiltinComponents['PbrMaterial'];
export const MaterialPropertyBlock = defineBuiltinComponent('MaterialPropertyBlock');
export type MaterialPropertyBlock = BuiltinComponents['MaterialPropertyBlock'];
export const SpriteRenderer = defineBuiltinComponent('SpriteRenderer');
export type SpriteRenderer = BuiltinComponents['SpriteRenderer'];
export const AnimatedSprite2D = defineBuiltinComponent('AnimatedSprite2D');
export type AnimatedSprite2D = BuiltinComponents['AnimatedSprite2D'];
export const Line2D = defineBuiltinComponent('Line2D');
export type Line2D = BuiltinComponents['Line2D'];
export const Grid = defineBuiltinComponent('Grid');
export type Grid = BuiltinComponents['Grid'];
export const Tilemap = defineBuiltinComponent('Tilemap');
export type Tilemap = BuiltinComponents['Tilemap'];
export const AnimationPlayer = defineBuiltinComponent('AnimationPlayer');
export type AnimationPlayer = BuiltinComponents['AnimationPlayer'];
export const Animator = defineBuiltinComponent('Animator');
export type Animator = BuiltinComponents['Animator'];
export const TimelineDirector = defineBuiltinComponent('TimelineDirector');
export type TimelineDirector = BuiltinComponents['TimelineDirector'];
export const AudioListener = defineBuiltinComponent('AudioListener');
export type AudioListener = BuiltinComponents['AudioListener'];
export const AudioSource = defineBuiltinComponent('AudioSource');
export type AudioSource = BuiltinComponents['AudioSource'];
export const AudioMixer = defineBuiltinComponent('AudioMixer');
export type AudioMixer = BuiltinComponents['AudioMixer'];
export const RigidBody3D = defineBuiltinComponent('RigidBody3D');
export type RigidBody3D = BuiltinComponents['RigidBody3D'];
export const BoxCollider3D = defineBuiltinComponent('BoxCollider3D');
export type BoxCollider3D = BuiltinComponents['BoxCollider3D'];
export const SphereCollider3D = defineBuiltinComponent('SphereCollider3D');
export type SphereCollider3D = BuiltinComponents['SphereCollider3D'];
export const Rigidbody2D = defineBuiltinComponent('Rigidbody2D');
export type Rigidbody2D = BuiltinComponents['Rigidbody2D'];
export const BoxCollider2D = defineBuiltinComponent('BoxCollider2D');
export type BoxCollider2D = BuiltinComponents['BoxCollider2D'];
export const CircleCollider2D = defineBuiltinComponent('CircleCollider2D');
export type CircleCollider2D = BuiltinComponents['CircleCollider2D'];
export const Layer = defineBuiltinComponent('Layer');
export type Layer = BuiltinComponents['Layer'];
export const EditorOnly = defineBuiltinComponent('EditorOnly');
export type EditorOnly = BuiltinComponents['EditorOnly'];
export const AutoRotate = defineBuiltinComponent('AutoRotate');
export type AutoRotate = BuiltinComponents['AutoRotate'];
export const ParticleEmitter2D = defineBuiltinComponent('ParticleEmitter2D');
export type ParticleEmitter2D = BuiltinComponents['ParticleEmitter2D'];
export const ParticleEmitter3D = defineBuiltinComponent('ParticleEmitter3D');
export type ParticleEmitter3D = BuiltinComponents['ParticleEmitter3D'];
export const SpineSkeleton = defineBuiltinComponent('SpineSkeleton');
export type SpineSkeleton = BuiltinComponents['SpineSkeleton'];
export const Canvas = defineBuiltinComponent('Canvas');
export type Canvas = BuiltinComponents['Canvas'];
export const GraphicRaycaster = defineBuiltinComponent('GraphicRaycaster');
export type GraphicRaycaster = BuiltinComponents['GraphicRaycaster'];
export const CanvasScaler = defineBuiltinComponent('CanvasScaler');
export type CanvasScaler = BuiltinComponents['CanvasScaler'];
export const RectTransform = defineBuiltinComponent('RectTransform');
export type RectTransform = BuiltinComponents['RectTransform'];
export const AspectRatioFitter = defineBuiltinComponent('AspectRatioFitter');
export type AspectRatioFitter = BuiltinComponents['AspectRatioFitter'];
export const ContentSizeFitter = defineBuiltinComponent('ContentSizeFitter');
export type ContentSizeFitter = BuiltinComponents['ContentSizeFitter'];
export const Image = defineBuiltinComponent('Image');
export type Image = BuiltinComponents['Image'];
export const RawImage = defineBuiltinComponent('RawImage');
export type RawImage = BuiltinComponents['RawImage'];
export const Shadow = defineBuiltinComponent('Shadow');
export type Shadow = BuiltinComponents['Shadow'];
export const Outline = defineBuiltinComponent('Outline');
export type Outline = BuiltinComponents['Outline'];
/** UI Button component token (not the @Button decorator). */
export const UIButton = defineBuiltinComponent('Button');
export type UIButton = BuiltinComponents['Button'];
export const Text = defineBuiltinComponent('Text');
export type Text = BuiltinComponents['Text'];
export const Toggle = defineBuiltinComponent('Toggle');
export type Toggle = BuiltinComponents['Toggle'];
export const ToggleGroup = defineBuiltinComponent('ToggleGroup');
export type ToggleGroup = BuiltinComponents['ToggleGroup'];
export const Slider = defineBuiltinComponent('Slider');
export type Slider = BuiltinComponents['Slider'];
export const Scrollbar = defineBuiltinComponent('Scrollbar');
export type Scrollbar = BuiltinComponents['Scrollbar'];
export const Panel = defineBuiltinComponent('Panel');
export type Panel = BuiltinComponents['Panel'];
export const CanvasGroup = defineBuiltinComponent('CanvasGroup');
export type CanvasGroup = BuiltinComponents['CanvasGroup'];
export const LayoutGroup = defineBuiltinComponent('LayoutGroup');
export type LayoutGroup = BuiltinComponents['LayoutGroup'];
export const RectMask2D = defineBuiltinComponent('RectMask2D');
export type RectMask2D = BuiltinComponents['RectMask2D'];
export const Mask = defineBuiltinComponent('Mask');
export type Mask = BuiltinComponents['Mask'];
/** UI ProgressBar component token (not the @ProgressBar decorator). */
export const UIProgressBar = defineBuiltinComponent('ProgressBar');
export type UIProgressBar = BuiltinComponents['ProgressBar'];
export const InputField = defineBuiltinComponent('InputField');
export type InputField = BuiltinComponents['InputField'];
export const Dropdown = defineBuiltinComponent('Dropdown');
export type Dropdown = BuiltinComponents['Dropdown'];
export const ListView = defineBuiltinComponent('ListView');
export type ListView = BuiltinComponents['ListView'];
export const ScrollView = defineBuiltinComponent('ScrollView');
export type ScrollView = BuiltinComponents['ScrollView'];
export const TabView = defineBuiltinComponent('TabView');
export type TabView = BuiltinComponents['TabView'];

/** Runtime registry whose key coverage is compile-checked against the generated IDL map. */
export const BUILTIN_COMPONENT_TYPES = {
  Name,
  Transform,
  Transform2D,
  Camera3D,
  DirectionalLight,
  EnvironmentLight,
  PointLight,
  SpotLight,
  Light2D,
  Camera2D,
  MeshRenderer,
  PbrMaterial,
  MaterialPropertyBlock,
  SpriteRenderer,
  AnimatedSprite2D,
  Line2D,
  Grid,
  Tilemap,
  AnimationPlayer,
  Animator,
  TimelineDirector,
  AudioListener,
  AudioSource,
  AudioMixer,
  RigidBody3D,
  BoxCollider3D,
  SphereCollider3D,
  Rigidbody2D,
  BoxCollider2D,
  CircleCollider2D,
  Layer,
  EditorOnly,
  AutoRotate,
  ParticleEmitter2D,
  ParticleEmitter3D,
  SpineSkeleton,
  Canvas,
  GraphicRaycaster,
  CanvasScaler,
  RectTransform,
  AspectRatioFitter,
  ContentSizeFitter,
  Image,
  RawImage,
  Shadow,
  Outline,
  Button: UIButton,
  Text,
  Toggle,
  ToggleGroup,
  Slider,
  Scrollbar,
  Panel,
  CanvasGroup,
  LayoutGroup,
  RectMask2D,
  Mask,
  ProgressBar: UIProgressBar,
  InputField,
  Dropdown,
  ListView,
  ScrollView,
  TabView,
} as const satisfies {
  [K in BuiltinComponentName]: ComponentType<BuiltinComponents[K]> & {
    readonly typeName: K;
  };
};
