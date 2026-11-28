# Samples

游戏脚本使用 TypeScript 或 JavaScript，原生编辑器与 Player 通过 QuickJS-NG 执行。

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

TypeScript 示例以 `.ts` 为源码；包含独立生成器的示例按各自 README 重建脚本与场景。

## 原创 3D 游戏

- [Lumen Shoal / 流光泻湖](lumen-shoal/README.md)：分步教学式 3D 展示 sample——从空场景逐步搭到写实黄昏泻湖，演示法线、水体、反射、体积云，并可在写实/低多边形/像素三种风格间切换；左下角代码块 + 中英字幕旁白，含原生实机截图与零被拒管线验收。

- [Ion Outpost / 离子前哨](ion-outpost/README.md)：CC0 真实角色、怪物与场景资产，双武器 FPS、机器人、房间、60 Hz 权威帧同步、预测校正、断线重连；含多进程原生验收与 Windows Player。

- [Pelican Island Ride / 鹈鹕环岛骑行](pelican-island-ride/README.md)：原创 3D 海岛环游骑行场景——连续曲面鹈鹕骑着复古沙滩单车绕闭合热带海岛骑行，含实时踩踏曲柄联动、椰林灯塔渔村码头、盘旋海鸥、动态海面与晴昼/日落切换。

- [Verdant Forest / 翠影幽林](verdant-forest/README.md)：大型写实 3D 森林场景（220m×220m）——从 Poly Haven 1:1 导入真实 CC0 摄影测量自然资产（冷杉、灌木、苔岩、倒木、蕨类）、PBR 林地贴图与 32-bit 森林 HDRI，支持按键 1/2/3 实时切换 PBR / 卡渲 Toon / 标准 Blinn-Phong 渲染与自由漫游。

- [Metro City / 落日都市](metro-city/README.md)：大型 3D 现代都市街区（136m×136m，17×17 模块化网格）——从 Kenney CC0 商业/道路/车辆/植被资产包 1:1 导入 34 套真实建筑街道模型并搭配 32-bit 日落 HDRI、25 盏实时路灯点光源与动态车流，支持按键 1/2/3 实时切换 PBR / 卡渲 Toon / 标准渲染。

- [Pelican Road Rage / 鹈鹕暴力摩托](pelican-road-rage/README.md)：六人海岸竞速、翼击战斗、漂移氮气、连续曲面角色、夕阳海面、三个跟随镜头；含实机截图、完整比赛验证和 Windows Player 构建入口。

## 原创 2D 游戏

- [Astral Thunder / 雷霆战机](thunder-fighter/README.md)：两段关卡、两名 Boss、五种弹幕阶段、擦弹充能、Nova 清屏、武器升级和追踪导弹；含原生截图、完整通关验证与 Windows Player 构建入口。

## Unity 官方示例移植

- [Brick](unity-brick/README.md)：128 块砖、2D 物理碰撞、挡板输入、落底重开，保留官方 MIT 贴图和场景配色。
- [Animated Tile](unity-animated-tile/README.md)：官方瀑布切片、8 个动画单元格，支持暂停/单步与重新播放。
- [Destructible](unity-destructible/README.md)：十字爆破、不可破坏边界、邻接规则、破损贴花与爆炸 Sprite 动画。
- [来源与验收进度](../docs/unity-samples-progress.md)。
