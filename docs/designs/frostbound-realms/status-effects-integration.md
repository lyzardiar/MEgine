# 原版状态特效接入

作者：MiYu

战场按实际恢复、保存权杖、古树治疗、残废和建筑生命状态显示转换后的 Warcraft III 特效。治疗药膏和恢复卷轴使用各自的原版素材；净化药水、保存权杖、回春术及残废分别占用独立通道。受伤中断恢复、效果到期、死亡、驻军和迷雾隐藏都会停用对应实体。火焰按建筑生命比例分级，并在修复、建造中和古树拔根时停止。

24 个原版特效的 `.mfx` 与纹理依赖已经复制到样例。`effect-sources.json` 保存原始 MDX 和贴图哈希、转换输出哈希、固定查看器版本及工具许可。共享 `G:/work/github/MEgine/asset-library` 保持只读。

转换器新增 `--attachments`，从源 MDX 的节点层级导出动态挂点位置。样例索引包含 94 个去重模型、131 个模型键的 origin 与 sprite 挂点；动画名称、时长和网格动画逐一对应。客户端插值挂点位置并应用模型实际缩放和朝向。无源挂点的建筑使用屋顶位置。火焰当前使用样例的 75%、50%、25% 生命阈值；这组阈值尚未对照原版游戏常量验收。

每个单位的状态特效使用独立、默认失活的 `SampledEffect` 实体。实体没有占位网格。特效时间来自模拟帧；单机使用固定步长余量，联机使用收到的权威帧。暂停不推进特效，重连和读档直接恢复当前状态，不需要复播历史事件，也不改变战斗随机数。

## 验证

- `test-frost-effects.mjs`：实际客户端与物品、施法命令，四族火焰、动态挂点、并存效果、暂停、修复、拔根、建造、迷雾、死亡、驻军、存档及双客户端快照恢复通过。
- `test-frost-effects-network.mjs`：真实 TCP 双客户端、药膏、残废、伤害中断和重连通过。
- 物品、施法、商店客户端、投射物及伐木客户端回归通过。
- `test-frost-effects-import.py`：独立输出字节一致，拒绝覆盖手工修改且拒绝后不改变任何输出。
- `native-status-effects-play.json`：原生 `EditorPlayRuntime` 的 QuickJS 执行完整游戏脚本，注入 F1 后推进 18 帧；共享 Game View GPU 渲染器绘制 30 个原版特效实体，拒绝材质管线数为 0。画面见 `classic-status-native-play.png`。
- `native-status-effects-qa.json`：Tauri 编辑器桥接验收失败，查询超时。生产协议编辑器可加载页面，页面诊断还记录了 Native Scene View shared-frame 超时。该记录保留为失败，不能作为编辑器交互或原生双窗口联机通过的证据。

原生脚本与 GPU 验证、TCP 验证和 Tauri 验证分别记录。物理鼠标、音频以及完整 Warcraft III 游戏仍未验收完成。

## 重生成与复验

```powershell
python scripts/import-frost-effects.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
node scripts/build-frostbound.mjs
node scripts/test-frost-effects.mjs
node scripts/test-frost-effects-network.mjs
python scripts/test-frost-effects-import.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
node scripts/qa-frost-effects.mjs --prepare-only
node scripts/render-frost-effects-play.mjs
```

原生预览工具通过 `cargo build --release -p mengine-editor-host --example render_asset_preview` 构建，支持 `--play-frames N` 执行固定帧数的原生游戏脚本。生产版 Tauri 需先构建 `packages/editor` 前端，再使用 `cargo build --release -p mengine-editor-tauri --features tauri/custom-protocol`，并将当前二进制路径传给 QA。已安装的编辑器程序没有替换。

## 特效精度与后续接入

状态效果目前播放 Stand；Birth/Death 过渡尚未接入。MDX 挂点的 KATV 可见性轨道没有应用。`.mfx` 仍是固定查看器的离散模拟采样，短循环中跨周期的粒子存续、世界空间尾迹、squirt、缎带细节及 Modulate2X 与原版求解器存在差异。几何特效、闪电护盾、嗜血、传送、投射物及技能命中特效需要继续绑定；战场悬崖、碰撞和地图编辑器完整复刻也仍有未完成项。
