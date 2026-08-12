<!-- Author: MiYu -->

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

## 游戏输入、实体和 UI 事件

Player 会在 `onTick` 前刷新只读 `engine.input` 与 `engine.entities`。按键边沿会保留到
下一游戏帧，实体 ID 使用字符串避免 JavaScript 整数精度丢失：

```ts
const player = engine.findEntity('Player');
if (player && engine.isKeyHeld('W')) {
  engine.setComponent(player, 'Transform', nextTransform);
}

function onUiAction(event: EngineUiActionInfo): void {
  if (event.callback === 'login' && (event.action === 'click' || event.action === 'submit')) {
    // Button、InputField、Toggle、Slider、Dropdown、ListView、TabView 共用此事件入口。
  }
}
```

`spawnEntity`、`setComponent`、`removeComponent` 与 `destroyEntity` 仍通过帧边界命令缓冲
修改 World。新实体可在下一帧通过唯一名称发现；单条命令 JSON 上限为 256 KiB。

## 编辑器游戏数据

`engine.data` 包含 `Assets/Data` 下的 `.mskill`、`.mlevel` 和 `.mgame` JSON 资产，
以项目相对路径为键。Player 会递归加载最多 256 个文件、8 层目录和 8 MiB 数据；符号链接、
损坏 JSON 或超限数据会被拒绝。脚本只能读取这份启动快照，不能借此获得任意文件系统权限。

## 项目存档

`engine.storage` 是项目隔离的 JSON 对象。修改后调用 `engine.save()` 才会持久化；
`engine.clearSave()` 清空并请求保存。Player 将数据写入当前用户的数据目录，不写入发布包，
根对象必须是 JSON object 且最大 1 MiB。脚本不会获得任意文件系统访问权限。

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

## Player 构建

新建工程默认使用 `Assets/Scripts/Main.ts` 作为 `startupScript`，并生成同目录的
`mengine.d.ts`。PC Build 会对 Scripts 目录执行严格 TypeScript 检查，将启动脚本
路径改写为对应的 `.js` 后写入 Player 配置。存在类型错误时构建失败且不会发布半成品；
源码 `.ts` 和声明 `.d.ts` 不会进入最终 Player 内容。
