# Runtime scripting

MEngine 的 PC Player 和桌面编辑器 Play Mode 使用 Boa 执行项目配置中的启动脚本。脚本只通过全局
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

## Player 构建

新建工程默认使用 `Assets/Scripts/Main.ts` 作为 `startupScript`，并生成同目录的
`mengine.d.ts`。PC Build 会对 Scripts 目录执行严格 TypeScript 检查，将启动脚本
路径改写为对应的 `.js` 后写入 Player 配置。存在类型错误时构建失败且不会发布半成品；
源码 `.ts` 和声明 `.d.ts` 不会进入最终 Player 内容。

## Editor Play 与输入

桌面编辑器 Play 会在内存中严格编译 `startupScript`，编译失败会在 Console 中显示原因。
停止播放恢复编辑前的场景；运行中的场景切换、物理和脚本修改不会写回源场景。
Editor 和 Player 共用场景解析以及 Prefab、Animator、Animation、Timeline、Audio 请求处理。
Editor 的 Timeline 粒子 seek 和相机 override 尚未接入视口；运行时 UI 控件事件也仍需单独验收。

`engine.snapshot` 在每帧脚本及物理事件前更新，`elapsed` 是当前场景的模拟秒数。暂停冻结该时间，场景重载归零；原生序列帧动画使用同一时钟。通过 `engine.pushCommandJson` 提交修改，
不要把修改 snapshot 对象当成修改引擎世界。每个脚本宿主的命令队列彼此隔离。

```ts
function onTick(dt: number): void {
  const input = engine.input;
  const horizontal = Number(input.keys.includes('KeyD')) - Number(input.keys.includes('KeyA'));
  if (input.pressedKeys.includes('Space')) { /* 本次按下边沿，只出现一帧 */ }
  // input.pointer: Game 内容区左上角起算的像素坐标；viewport: 内容区尺寸。
  // buttons / pressedButtons / releasedButtons: 0 左键，1 中键，2 右键。
}
```

键盘采用物理按键代码，例如 `KeyA`、`ArrowLeft` 和 `Space`。失焦释放输入。
Agent 可调用 `playback.input`（MCP `set_game_input`）设置 held 状态，结合 `playback.pause`
和 `playback.step` 做可重复的交互验收。`playback.play {paused:true}` 在首帧前暂停，避免初始化后自动推进。Play 和 Step 的返回值会等待脚本完成，截图会等待新帧。

## 色调映射

`EnvironmentLight.tone_mapping` 控制 HDR 场景的 ACES 色调映射，默认 `true` 保持既有场景行为。
关闭时仍应用 `exposure`，随后由输出附件编码为 sRGB；Sprite/UI 在后处理之后绘制。
来源为 Gamma 的 2D 场景需要在导入时将数值 RGB 解码到线性空间，同时关闭 ACES。
纹理继续使用 sRGB 采样，不再次转换像素。官方 2D 示例在相机实体上保存该 EnvironmentLight 设置，
并禁用环境背景，使场景背景颜色直接输出。原生截图验证背景为源颜色 `(49,77,121)`。
