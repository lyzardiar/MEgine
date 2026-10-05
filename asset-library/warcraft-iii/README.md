# Warcraft III 引擎资产

`game-ready` 保存四族主要单位、建筑、英雄和中立怪物；`remaining-ready` 保存补充提取的原版场景、角色、头像、UI 和带网格的特效；`community-ready` 保存用户提供的 HIVE 模型包和 UTM 4.0 地图内的模型。原始文件、依赖关系、来源和 SHA-256 均随各集合保存。原版安装包索引的 3,264 个 MDX 已全部提取并处理：186 个主要模型、2,866 个补充几何模型，另外 212 个没有 geoset 的资源需要粒子/缎带适配。社区来源共 1,514 个模型：1,482 个生成了几何模型，15 个缺贴图、17 个无 geoset。三套库合计 4,534 个几何模型和 12,623 段动画；地形包含 161 张图集、4,065 个原始 tile。异常原因分别记录于 extraction-checks.json 与 conversion-checks.json；几何转换完成不代表全部特效行为已适配。

每个集合的 `Assets/WarcraftIII/model-catalog.json` 列出 prefab、每层材质、网格、骨骼动画、队色、动态纹理和状态轨道；`terrain-catalog.json` 列出地形图集和原始 64×64 tile。`id` 是源文件名标签，可能重名；使用完整 `source` 或 `prefab` 路径识别模型。模型坐标按 `(x,y,z) → (x,z,-y)` 转换，长度为原始 MDX 的 1/128，保留模型原点。

动画以 12 Hz 采样，所有部件共用 clip/frame。`animatedMesh#pose=clip:frame` 使用原生姿态加载器；`frameCount` 是 12 Hz 区间数，实际保存 `frameCount+1` 个采样，最后一个采样对应源动画的精确终点。每个动画的 `menginePlayback` 保存源时长及循环标志：循环动作按源时长回绕，非循环动作在 `frameCount` 帧到达并保持末姿态；UV 和材质状态轨道也使用这一终点。没有播放元数据的旧 GLB 保持原有循环行为。材质 alpha、geoset 可见性/颜色和纹理切换由 `stateTracks` 提供。队色材质覆盖全部相关层；`textureMaterials` 按采样状态中的 texture ID 选择。UV 动画保存在各层 GLB 的 `mengineUv` 状态中，由原生加载器应用；多个 UV 通道使用对应的层网格。独立的上层材质使用 depth_equal 接受同深度片元，并保留源光照与双面语义。

`Validation/conversion-checks.json` 是转换结果，`Validation/verification.json` 是源哈希、序列化姿态、贴图和实际引擎加载验证。几何误差阈值为 0.5 个原始 MDX 单位（0.00390625 引擎单位），报告保留每个模型的实测误差。原包缺失贴图及纯粒子/光照模型分别列入提取和转换异常清单。粒子、缎带、相机朝向 billboard 和灯光尚未完整适配；各模型 `effects` 记录这些源内容，原始 MDX 保持原字节。

部分 UTM 静态模型的原文件包含 NaN 枢轴。转换仅对没有动画的 Bone/Helper 将枢轴归零：其世界变换为 identity，枢轴在 bind 和 pose 中抵消，因此不改变几何。`sourceRepairs.unanimatedNonfinitePivots` 记录对应节点；有动画或特效的无效枢轴仍拒绝转换。

缺少源法线的 geoset 按三角面生成面积加权法线，`sourceRepairs.generatedNormals` 保留对应索引。四族鼠标的 replaceable 21 使用同目录原版 BLP；BloodSphere 的五个作者机器 TGA 路径映射到安装包中的同名 BLP，`textureSources` 保留映射依据。

这些集合已供引擎导入和模型预览使用；Frostbound 战场已接入 114 项经典角色、四族建筑、季节树木、岩石与金矿绑定，共 4,952 个运行时文件，覆盖模型部件、动画、队色、尸体、建造预览和动态头像。`docs/designs/frostbound-realms/classic-battlefield-0.png` 至 `classic-battlefield-3.png` 是通过原生四族场景验证的战场截图；`classic-assets-preview.png`、`community-assets-preview.png` 与 `remaining-assets-preview.png` 是资产库预览。地面已接入 Winter、Forest、Barrens 的原版 tile 与拼接遮罩；`tree-skins-ready` 提供两张原版季节树木贴图，冬季使用覆雪材质，金矿保留完整部件与工作动画；原版 cliff 模块、水动画、其余模型与完整特效行为仍需继续接入。

## 重生成与验证

依赖 Python、.NET 10 SDK，以及 `scripts/warcraft-assets/requirements.txt` 中的库；MPQ 读取库已附 MIT 源码。转换器使用固定提交 `4fe46a0772520fc7b55078bf32cda1237d1b5f2e` 的 W3ModelViewer 解析器。

已有集合包含重生成所需原始数据，可输出到独立目录：

```powershell
python scripts/convert-warcraft-assets.py --input asset-library/warcraft-iii/game-ready --output tmp/classic-reproduction --keep-going
python scripts/convert-warcraft-assets.py --input asset-library/warcraft-iii/community-ready --output tmp/community-reproduction --keep-going
python scripts/validate-warcraft-assets.py --root tmp/classic-reproduction --runtime <mengine-runtime.exe 的完整路径> --pose-probe <gltf_bounds.exe 的完整路径>
```

`--reuse-samples` 仅在原文件、采样器二进制和缓存 JSON 的哈希全部匹配时复用采样结果。已生成文件被手工改动时，转换器拒绝覆盖。源文件和生成文件校验值位于各集合的 `asset-sources.json`，工具版本与哈希位于 `Licenses/converter-sources.json`。

预览使用编辑器共用的原生 Game View GPU 渲染器：`node scripts/render-warcraft-library.mjs` 生成经典预览，追加 `--community` 生成社区预览，追加 `--remaining` 生成补充原版资源预览。可用 `MENGINE_ASSET_PREVIEW_EXECUTABLE` 指定本地构建的 `render_asset_preview.exe`。

三套包均通过哈希、贴图、序列化姿态和实际运行时加载验证，场景累计 244,348 个实体。原生终点与越界保持比较共 87,078 次，最大顶点误差 0.002788682 引擎单位，低于 0.00390625 阈值；同时检查 UV、顶点数和单位法线。资产库 66 项、动画边界与蒙皮 8 项、既有角色 3 项测试通过；既有 RHI 串行 52 项和材质传递 1 项通过。RHI 并行测试曾发生 STATUS_HEAP_CORRUPTION；串行复跑全部通过，尚未确认该并行崩溃的根因。原生图片与包加载验证通过，不代表物理鼠标或音频验收。

## 来源与署名

- 经典 Warcraft III 资产：本机 Warcraft III Frozen Throne 安装包，Blizzard Entertainment；这些游戏资产没有转为 CC0 或 MIT。
- Footman、Captain 和衍生单位：[Ujimasa Hojo](https://www.hiveworkshop.com/threads/footman-captain-and-derivatives.300263/)，纹理/动画贡献包含 CloudWolf、Wandering Soul；血精灵变体为 [Cuore](https://www.hiveworkshop.com/threads/blood-elf-lieutenant-and-derivatives.300294/)。
- Beautiful City 与 Raven Mountain：[ValdionWorld](https://www.hiveworkshop.com/threads/beautiful-city-model-pack.330555/)，[Raven Mountain 来源](https://www.hiveworkshop.com/threads/raven-mountain-model-pack.330554/)。
- Quick Slash：[Judash137 / Khil](https://www.hiveworkshop.com/threads/quick-slash-pack.363862/)，OVOgenez 上传；分享说明见[作者来源帖](https://www.hiveworkshop.com/threads/judash137s-models.363771/)。
- [UTM 4.0](https://www.hiveworkshop.com/threads/the-ultimate-terraining-map-4-0.252232/)：DungeonM、fladdermasken 及地图内各素材作者，包括 Talavaj、tobyfat50、oGre_、Born^{2}Modificate、Deolrin 等；原包作者说明随来源记录保存。

原包的署名与使用说明继续有效；这些资产没有统一标准开源许可。工具的 MIT 许可仅适用于工具源码。
