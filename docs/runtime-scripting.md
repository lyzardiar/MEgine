# Runtime scripting

MEngine 的 PC Player 使用 Boa 执行项目配置中的启动 JavaScript。脚本只通过全局
`engine` 桥接器提交受控请求，场景和 World 的实际修改发生在帧边界。

## 生命周期

```ts
function onSceneLoaded(scene: EngineSceneInfo): void {
  // 首个场景完成加载，以及后续每次成功切换后调用。
}

function onTick(dt: number, frame: number): void {
  // 每个渲染帧调用。场景请求会在本次回调返回后执行。
}
```

`engine.scene` 保存当前场景信息：

- `name`：场景文件内的场景名；
- `path`：项目相对路径；
- `buildIndex`：在 Scenes In Build 中的索引，开发模式下可能为 `null`；
- `buildSceneCount`：Scenes In Build 的数量。

## 场景切换

```ts
engine.loadScene(1);                              // 按 Build Settings 索引
engine.loadScene('Level2');                       // 按唯一文件名
engine.loadScene('Assets/Scenes/Level2.mscene'); // 按项目相对路径
engine.reloadScene();                             // 原子重载当前场景
```

打包后的 Player 只允许加载 Scenes In Build 中的场景。名称有歧义时必须使用完整的
项目相对路径。加载先进入临时 World，解析成功后才替换当前 World，因此无效路径、
损坏文件或白名单外请求都不会清空正在运行的场景。

完整 TypeScript 声明位于 `samples/types/engine.d.ts`。
