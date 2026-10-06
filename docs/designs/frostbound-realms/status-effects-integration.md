# 原版状态与技能特效接入

作者：MiYu

战场按实际恢复、保存权杖、古树治疗、残废和建筑生命状态显示转换后的 Warcraft III 特效。治疗药膏和恢复卷轴使用各自的原版素材；净化药水、保存权杖、回春术及残废分别占用独立通道。受伤中断恢复、效果到期、死亡、驻军和迷雾隐藏都会停用对应实体。火焰按建筑生命比例分级，并在修复、建造中和古树拔根时停止。

31 个原版特效的 `.mfx` 与纹理依赖已经复制到样例，其中 7 个技能资源同时接入 27 个动画网格部件。`effect-sources.json` 保存原始 MDX 和贴图哈希、转换输出哈希、转换清单与导入器哈希、固定查看器版本及工具许可。共享 `G:/work/github/MEgine/asset-library` 保持只读。

转换器新增 `--attachments`，从源 MDX 的节点层级导出动态挂点位置。样例索引包含 94 个去重模型、131 个模型键的 origin、sprite 与左右手挂点；动画名称、时长和网格动画逐一对应。客户端插值挂点位置并应用模型实际缩放和朝向。无源挂点的建筑使用屋顶位置。火焰当前使用样例的 75%、50%、25% 生命阈值；这组阈值尚未对照原版游戏常量验收。

每个单位的状态特效使用独立、默认失活的 `SampledEffect` 实体。实体没有占位网格。特效时间来自模拟帧；单机使用固定步长余量，联机使用收到的权威帧。暂停不推进特效，重连和读档直接恢复当前状态，不需要复播历史事件，也不改变战斗随机数。

嗜血使用左手 `BloodLustTarget` 与右手 `BloodLustSpecial`；闪电护盾使用 `LightningShieldTarget` 与一次性 `LightningShieldBuff`；回城分别使用 `MassTeleportCaster`、目的区域 `MassTeleportTo` 和各乘客到达时的 `MassTeleportTarget`。绑定来自本机四个游戏 MPQ 按补丁优先级读取的 `[Bblo]`、`[Blsh]`、`[AItp]`，原始配置及哈希保存在 `SourceAssets/AbilityArt`。技能实体以子网格应用源材质颜色、透明度及纹理状态，按源时长播放 Birth、Stand 和一次性动画；网格使用引擎支持的整数帧 `#pose=clip:frame@30`。这 7 个技能模型中 26 处 billboard 标记由引擎按每个相机处理，来源和独立源姿态验证见 [节点相机朝向](billboard-integration.md)。闪电护盾 Birth 阶段网格透明度为零，画面由缎带表现。

成功回城的每个乘客保存权威 `portalArrivalFrame`；本机、客机、读档和重连以同一模拟帧恢复到达效果。该字段必须为非负安全整数且不超过存档帧。嗜血、闪电护盾和回城的可见效果来自上述原版资源。

## 验证

- `test-frost-effects.mjs`：实际客户端与物品、施法命令，四族火焰、动态挂点、并存效果、暂停、修复、拔根、建造、迷雾、死亡、驻军、存档及双客户端快照恢复通过。
- `test-frost-effects-network.mjs`：真实 TCP 双客户端、药膏、残废、嗜血、闪电护盾、伤害中断和重连通过。
- `test-frost-spell-art.mjs`：实际施法命令、左右手动态挂点、Birth/Stand、整数动画帧、源材质可见性、暂停、迷雾、驻军、死亡、净化移除、回城区域与乘客到达、存档校验和两客户端权威到达时钟通过。
- 物品、施法、商店客户端、投射物及伐木客户端回归通过。
- `test-frost-effects-import.py`：独立输出字节一致，拒绝覆盖手工修改且拒绝后不改变任何输出。
- `spell-art-validation.json`：183 个导入文件、31 个源 MDX、转换清单与转换器源码哈希核对通过；7 个资源、27 个网格部件共 259 次原生加载，48 组非循环动画终点保持检查通过。
- `native-status-effects-play.json`：原生 `EditorPlayRuntime` 的 QuickJS 执行完整游戏脚本，注入 F1 后推进 18 帧；共享 Game View GPU 渲染器绘制 30 个原版特效实体，拒绝材质管线数为 0。画面见 `classic-status-native-play.png`。
- `native-status-effects-qa.json`：生产协议 Tauri 编辑器通过首次工程打开、单机 30 个原版特效、游戏暂停、真实 TCP 双客户端和断线重连检查。两端均有 30 个活动特效，材质管线拒绝数为 0。画面见 `classic-status-battlefield.png` 与 `classic-status-network.png`；后者为客机当前视角。
- `native-spell-art-qa.json`：原生编辑器实际执行嗜血、闪电护盾和回城施法，验证技能网格、到达效果、暂停、真实 TCP 两客户端与断线重连。画面见 `classic-spell-battlefield.png`、`classic-spell-arrival.png`、`classic-spell-network.png`。

首次资源扫描在后台工作线程创建并同步 GUID sidecar，保持界面与原生 IPC 可响应。资产分类、GUID 稳定性、无效与重复元数据检查通过。原生 QA 等待按下和松开输入各自经过运行时帧，再执行下一次操作；暂停比较以游戏实际报告已暂停为起点。相关检查记录见 `asset-discovery-qa.md`。

原生脚本与 GPU 验证、TCP 验证和 Tauri 验证分别记录。物理鼠标、音频以及完整 Warcraft III 游戏仍未验收完成。

## 重生成与复验

```powershell
python scripts/import-frost-effects.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
node scripts/build-frostbound.mjs
node scripts/test-frost-effects.mjs
node scripts/test-frost-spell-art.mjs
node scripts/test-frost-effects-network.mjs
python scripts/validate-frost-spell-art.py
python scripts/test-frost-effects-import.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
node scripts/qa-frost-effects.mjs --prepare-only
node scripts/render-frost-effects-play.mjs
$env:MENGINE_EDITOR_EXECUTABLE='<当前生产协议编辑器 exe 的完整路径>'
node scripts/qa-frost-effects.mjs
node scripts/qa-frost-effects.mjs --spell-art
```

原生预览工具通过 `cargo build --release -p mengine-editor-host --example render_asset_preview` 构建，支持 `--play-frames N` 执行固定帧数的原生游戏脚本。生产版 Tauri 需先构建 `packages/editor` 前端，再使用 `cargo build --release -p mengine-editor-tauri --features tauri/custom-protocol`，并将当前二进制路径传给 QA。已安装的编辑器程序没有替换。

## 特效精度与后续接入

恢复、残废和建筑火焰等状态效果目前播放 Stand；新接入技能播放 Birth/Stand，一次性效果按源时长结束。效果取消或到期的 Death 过渡尚未接入。MDX 挂点的 KATV 可见性轨道尚未应用；其他网格模型的 billboard 元数据及原版镜头行为仍需验证。`.mfx` 仍是固定查看器的离散模拟采样，短循环中跨周期的粒子存续、世界空间尾迹、squirt、缎带细节及 Modulate2X 与原版求解器存在差异。其他技能、投射物与命中特效绑定，以及战场悬崖、碰撞和地图编辑器完整复刻仍有未完成项。
