<!-- Author: MiYu -->

# Samples

游戏脚本用 **TypeScript** 编写，运行时执行编译后的 JS（Boa / 未来 QuickJS）。

```bash
# 从仓库根目录
npm run build:samples

# 再跑 demo
npm run sample:cube
npm run sample:survivors
```

| 文件 | 说明 |
|------|------|
| `spinning-cube/project.json` | 可由本地编辑器打开、可直接 PC Build 的标准工程清单 |
| `spinning-cube/Assets/Scenes/Main.mscene` | 摄像机、方向光和立方体场景 |
| `spinning-cube/Assets/Scripts/Main.ts` | TS 源码（改这里） |
| `spinning-cube/Assets/Scripts/Main.js` | `tsc` 输出，runtime sample 模式加载；PC Build 会重新编译 TS |
| `spinning-cube/Assets/Scripts/mengine.d.ts` | 标准工程内的脚本 API 类型声明 |
| `types/engine.d.ts` | `engine` / `onTick` 全局类型 |
| `eclipse-survivors/` | 完整的幸存者类游戏：登录、存档、装备、技能、三关卡、Boss、技能/关卡编辑器和原创生成美术 |

不要手写维护 `.js`；以 `.ts` 为准。
