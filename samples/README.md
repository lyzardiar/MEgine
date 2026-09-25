# Samples

游戏脚本用 **TypeScript** 编写，运行时执行编译后的 JS（Boa / 未来 QuickJS）。

```bash
# 从仓库根目录
npm run build:samples

# 再跑 demo
npm run sample:cube
```

| 文件 | 说明 |
|------|------|
| `spinning-cube/project.json` | 可由本地编辑器打开、可直接 PC Build 的标准工程清单 |
| `spinning-cube/Assets/Scenes/Main.mscene` | 摄像机、方向光和立方体场景 |
| `spinning-cube/Assets/Scripts/Main.ts` | TS 源码（改这里） |
| `spinning-cube/Assets/Scripts/Main.js` | `tsc` 输出，runtime sample 模式加载；PC Build 会重新编译 TS |
| `spinning-cube/Assets/Scripts/mengine.d.ts` | 标准工程内的脚本 API 类型声明 |
| `types/engine.d.ts` | `engine` / `onTick` 全局类型 |

不要手写维护 `.js`；以 `.ts` 为准。

## 原创 3D 游戏

- [Pelican Road Rage / 鹈鹕暴力摩托](pelican-road-rage/README.md)：六人海岸竞速、翼击战斗、漂移氮气、连续曲面角色、夕阳海面、三个跟随镜头；含实机截图、完整比赛验证和 Windows Player 构建入口。

## 原创 2D 游戏

- [Astral Thunder / 雷霆战机](thunder-fighter/README.md)：两段关卡、两名 Boss、五种弹幕阶段、擦弹充能、Nova 清屏、武器升级和追踪导弹；含原生截图、完整通关验证与 Windows Player 构建入口。

## Unity 官方示例移植

- [Brick](unity-brick/README.md)：128 块砖、2D 物理碰撞、挡板输入、落底重开，保留官方 MIT 贴图和场景配色。
- [Animated Tile](unity-animated-tile/README.md)：官方瀑布切片、8 个动画单元格，支持暂停/单步与重新播放。
- [Destructible](unity-destructible/README.md)：十字爆破、不可破坏边界、邻接规则、破损贴花与爆炸 Sprite 动画。
- [来源与验收进度](../docs/unity-samples-progress.md)。
