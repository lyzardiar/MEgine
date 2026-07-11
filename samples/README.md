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
| `spinning-cube/main.ts` | TS 源码（改这里） |
| `spinning-cube/main.js` | `tsc` 输出，runtime 加载 |
| `types/engine.d.ts` | `engine` / `onTick` 全局类型 |

不要手写维护 `.js`；以 `.ts` 为准。
