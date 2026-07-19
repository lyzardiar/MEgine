import { registerMenuItem } from './registry.ts';

registerMenuItem(
  'Assets/Create/Material',
  async (context) => {
    try {
      const { createProjectMaterial } = await import('../panels/Material');
      context.log(`Created ${await createProjectMaterial()}`);
    } catch (reason) {
      context.log(`Material 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 200 },
);

registerMenuItem(
  'Assets/Create/Surface Shader',
  async (context) => {
    try {
      const { createProjectSurfaceShader } = await import('../panels/SurfaceShader');
      context.log(`Created ${await createProjectSurfaceShader()}`);
    } catch (reason) {
      context.log(`Surface Shader creation failed: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 205 },
);

registerMenuItem(
  'Assets/Create/Animation Clip',
  async (context) => {
    try {
      const { createProjectAnimationClip } = await import('../panels/Timeline');
      context.log(`Created ${await createProjectAnimationClip()}`);
    } catch (reason) {
      context.log(`Animation Clip 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 205 },
);

registerMenuItem(
  'Assets/Create/Animator Controller',
  async (context) => {
    try {
      const { createProjectAnimatorController } = await import('../panels/Animator');
      context.log(`Created ${await createProjectAnimatorController()}`);
    } catch (reason) {
      context.log(`Animator Controller 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 210 },
);

registerMenuItem(
  'Assets/Create/Sprite Atlas',
  async (context) => {
    try {
      const { createProjectSpriteAtlas } = await import('../panels/SpriteAtlasEditor');
      context.log(`Created ${await createProjectSpriteAtlas()}`);
    } catch (reason) {
      context.log(`Sprite Atlas creation failed: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 210 },
);

registerMenuItem(
  'Assets/Create/Avatar Mask',
  async (context) => {
    try {
      const { createProjectAvatarMask } = await import('../panels/AvatarMask');
      context.log(`Created ${await createProjectAvatarMask()}`);
    } catch (reason) {
      context.log(`Avatar Mask 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 211 },
);

registerMenuItem(
  'Assets/Create/Timeline',
  async (context) => {
    try {
      const { createProjectTimeline } = await import('../panels/Sequencer');
      context.log(`Created ${await createProjectTimeline()}`);
    } catch (reason) {
      context.log(`Timeline 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 215 },
);
