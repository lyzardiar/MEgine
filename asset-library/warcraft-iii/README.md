# Warcraft III 引擎资产

`game-ready` 保存从本机经典 Warcraft III 安装包转换的四族单位、建筑、英雄、中立怪物和地形；`community-ready` 保存用户提供的 HIVE 模型包和 UTM 4.0 地图内的模型。原始文件、依赖关系、来源和 SHA-256 均随各集合保存。当前完成 186 个经典模型和 1,482 个社区模型，共 1,668 个；地形包含 161 张图集、4,065 个原始 tile。社区来源共 1,514 个模型：15 个缺贴图、17 个无 geoset，原因分别记录于 extraction-checks.json 与 conversion-checks.json。原版安装包索引中的其余 3,078 项尚未提取；索引数量不代表完成转换的数量。

每个集合的 `Assets/WarcraftIII/model-catalog.json` 列出 prefab、每层材质、网格、骨骼动画、队色、动态纹理和状态轨道；`terrain-catalog.json` 列出地形图集和原始 64×64 tile。模型坐标按 `(x,y,z) → (x,z,-y)` 转换，长度为原始 MDX 的 1/128，保留模型原点。

动画以 12 Hz 采样，所有部件共用 clip/frame。`animatedMesh#pose=clip:frame` 使用原生姿态加载器；非循环动画最大帧为 `frameCount-1`。材质 alpha、geoset 可见性/颜色和纹理切换由 `stateTracks` 提供。队色材质覆盖全部相关层；`textureMaterials` 按采样状态中的 texture ID 选择。UV 动画保存在各层 GLB 的 `mengineUv` 状态中，由原生加载器应用；多个 UV 通道使用对应的层网格。独立的上层材质使用 depth_equal 接受同深度片元，并保留源光照与双面语义。

`Validation/conversion-checks.json` 是转换结果，`Validation/verification.json` 是源哈希、序列化姿态、贴图和实际引擎加载验证。几何误差阈值为 0.5 个原始 MDX 单位（0.00390625 引擎单位），报告保留每个模型的实测误差。原包缺失贴图及纯粒子/光照模型分别列入提取和转换异常清单。粒子、缎带、相机朝向 billboard 和灯光尚未完整适配；各模型 `effects` 记录这些源内容，原始 MDX 保持原字节。

部分 UTM 静态模型的原文件包含 NaN 枢轴。转换仅对没有动画的 Bone/Helper 将枢轴归零：其世界变换为 identity，枢轴在 bind 和 pose 中抵消，因此不改变几何。`sourceRepairs.unanimatedNonfinitePivots` 记录对应节点；有动画或特效的无效枢轴仍拒绝转换。

这些集合已供引擎导入和模型预览使用；当前 Frostbound 战场的资源绑定仍需接入新集合。`docs/designs/frostbound-realms/classic-assets-preview.png` 与 `community-assets-preview.png` 是原生编辑器生成的模型预览，不代表完整战场替换验收。

## 重生成与验证

依赖 Python、.NET 10 SDK，以及 `scripts/warcraft-assets/requirements.txt` 中的库；MPQ 读取库已附 MIT 源码。转换器使用固定提交 `4fe46a0772520fc7b55078bf32cda1237d1b5f2e` 的 W3ModelViewer 解析器。

已有集合包含重生成所需原始数据，可输出到独立目录：

```powershell
python scripts/convert-warcraft-assets.py --input asset-library/warcraft-iii/game-ready --output tmp/classic-reproduction --keep-going
python scripts/convert-warcraft-assets.py --input asset-library/warcraft-iii/community-ready --output tmp/community-reproduction --keep-going
python scripts/validate-warcraft-assets.py --root tmp/classic-reproduction --runtime <mengine-runtime.exe 的完整路径>
```

`--reuse-samples` 仅在原文件、采样器二进制和缓存 JSON 的哈希全部匹配时复用采样结果。已生成文件被手工改动时，转换器拒绝覆盖。源文件和生成文件校验值位于各集合的 `asset-sources.json`，工具版本与哈希位于 `Licenses/converter-sources.json`。

预览使用编辑器共用的原生 Game View GPU 渲染器：`node scripts/render-warcraft-library.mjs` 生成经典预览，追加 `--community` 生成社区预览。可用 `MENGINE_ASSET_PREVIEW_EXECUTABLE` 指定本地构建的 `render_asset_preview.exe`。

验证中资产库 66 项、RHI 串行 52 项、材质传递 1 项均通过。RHI 并行测试曾发生 STATUS_HEAP_CORRUPTION；串行复跑全部通过，尚未确认该并行崩溃的根因。原生图片与包加载验证通过，不代表物理鼠标或音频验收。

## 来源与署名

- 经典 Warcraft III 资产：本机 Warcraft III Frozen Throne 安装包，Blizzard Entertainment；这些游戏资产没有转为 CC0 或 MIT。
- Footman、Captain 和衍生单位：[Ujimasa Hojo](https://www.hiveworkshop.com/threads/footman-captain-and-derivatives.300263/)，纹理/动画贡献包含 CloudWolf、Wandering Soul；血精灵变体为 [Cuore](https://www.hiveworkshop.com/threads/blood-elf-lieutenant-and-derivatives.300294/)。
- Beautiful City 与 Raven Mountain：[ValdionWorld](https://www.hiveworkshop.com/threads/beautiful-city-model-pack.330555/)，[Raven Mountain 来源](https://www.hiveworkshop.com/threads/raven-mountain-model-pack.330554/)。
- Quick Slash：[Judash137 / Khil](https://www.hiveworkshop.com/threads/quick-slash-pack.363862/)，OVOgenez 上传；分享说明见[作者来源帖](https://www.hiveworkshop.com/threads/judash137s-models.363771/)。
- [UTM 4.0](https://www.hiveworkshop.com/threads/the-ultimate-terraining-map-4-0.252232/)：DungeonM、fladdermasken 及地图内各素材作者，包括 Talavaj、tobyfat50、oGre_、Born^{2}Modificate、Deolrin 等；原包作者说明随来源记录保存。

原包的署名与使用说明继续有效；这些资产没有统一标准开源许可。工具的 MIT 许可仅适用于工具源码。
