# Warcraft III 补充转换

作者：MiYu

原有库的 229 个无 geoset 资源已生成 `effects-ready` 集合；15 个缺少原始贴图的社区模型已生成 `texture-pending` 集合。共享 `G:/work/github/MEgine/asset-library` 保持只读，输出位于当前工作树的 `asset-library/warcraft-iii`。

覆盖清单已核对 4,778 个源文件均有转换产物，待转换数为 0。另为嗜血、闪电护盾和回城的 7 个带网格技能资源生成 `spell-effects-ready` 集合，补充其粒子、缎带及灯光：21 段动画、265 帧，其中 6 个含可见采样效果，1 个只有辅助定义。其动画网格使用既有 `remaining-ready` 输出，样例已接入 27 个网格部件。来源清单保留源 MDX、转换器与输出哈希；接入和验证见 [原版状态与技能特效接入](status-effects-integration.md)。

## 资源与引擎

`effects-ready/Assets/WarcraftIII/effect-catalog.json` 索引 229 个源文件：210 个含粒子、缎带或灯光，19 个只含镜头、辅助节点或空定义。共 373 段动画、36,454 帧。每个资源保留原始 MDX、完整源轨道、纹理来源及校验值。两个低频循环岸线资源在采样前积累发射额度，`prewarmSeconds` 记录 7 秒和 8.333333 秒的预热，使短循环中每秒不足一颗的粒子能够出现。

新原生 `SampledEffect` 组件读取 `.mfx`：按源动画时长循环或保持终点，支持暂停、速度、时间定位、切换动画、文件更新与实体失活。粒子在当前相机下生成 billboard；尾迹和缎带使用原始采样端点；UV、颜色、透明度及 alpha-key 裁切通过共享原生渲染路径呈现。光照采样进入当前帧的点光、方向光与环境光。组件可与 `MeshRenderer` 共存。CLI 按组件及 `.mfx` 材质收集纹理依赖，并拒绝缺文件和错误动画终点。

采样来自固定版本 W3ModelViewer 的确定性查看器模拟器，**尚不等同于 Warcraft III 原始特效求解器**。随机序列、squirt、运动对象上的 world/model space、缎带发射细节与原游戏存在差异。动画以 12 Hz 离散播放，循环粒子的持续随机状态没有跨周期求解；源材质中的 Modulate2X 当前使用 multiply。方向/环境光映射使用引擎现有光照模型。19 个不可见资源的镜头、辅助轨道保留在源定义中，未自动驱动战场镜头。战场技能、天气与投射物的绑定需要继续接入。

`texture-pending/Assets/WarcraftIII/texture-pending-catalog.json` 包含 15 个模型、44 个材质层网格和 15 段动画；保留位置、法线、各层 UV、蒙皮、动态材质状态及原始纹理引用。源姿态比较最大误差 `2.1875000033588776e-07` 引擎单位。未生成替代贴图或战场 prefab。

缺失引用为 `redstone_rock.blp`、`worldtreetrunk.blp`、`rockseemles a1.blp` 和 `carpet.blp`。素材目录与本机四个游戏 MPQ 的文件索引中没有这些原始名称；当前提取清单记录了具体受影响模型。几何转换完成不表示材质完整。

## 重生成

先用现有几何转换器准备固定版本解析器和采样器：

```powershell
python -c "import sys; sys.path.insert(0, 'scripts'); import importlib; c = importlib.import_module('convert-warcraft-assets'); print(c.sampler()[0])"
python scripts/convert-warcraft-effects.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
python scripts/convert-warcraft-missing-geometry.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
python scripts/validate-warcraft-effects.py --probe <gltf_bounds.exe>
python scripts/audit-warcraft-coverage.py
node scripts/render-warcraft-effects.mjs
```

可用 `--output` 输出到独立目录。生成器先校验既有输出与源副本，拒绝覆盖手工修改的文件。粒子缓存同时校验源 MDX、采样器程序集、解析器程序集与缓存文件哈希。工具 MIT 许可、固定源提交与源文件 SHA-256 随集合保存；Warcraft III 原始资产仍属于 Blizzard，社区资产保留原作者条件。

验证已提交的集合时，`--converter-ref` 指定生成时的转换器 Git 版本，逐文件核对历史源码与来源清单中的 SHA-256；资产和原始 MDX 仍读取当前磁盘文件并严格校验。省略此参数会检查当前工作树的转换器源码，适用于刚用当前工具重新生成的集合。源码版本核对与原生加载检查不等同于重新生成验证。

```powershell
python scripts/validate-warcraft-effects.py --converter-ref 2b40e35271075b341d0b8d3c4b924045e7d709b3
```

技能集合可按已记录的 7 个明确路径重生成：

```powershell
$spellSources = (Get-Content asset-library/warcraft-iii/spell-effects-ready/Assets/WarcraftIII/effect-catalog.json -Raw | ConvertFrom-Json).models
$sourceArgs = @(); foreach ($model in $spellSources) { $sourceArgs += '--source'; $sourceArgs += $model.collection + '/' + $model.source }
python scripts/convert-warcraft-effects.py --output asset-library/warcraft-iii/spell-effects-ready --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll @sourceArgs
```

## 验证入口

- [新转换的原生加载与哈希结果](supplemental-conversion-validation.json)
- [完整来源覆盖清单](asset-conversion-coverage.json)
- [原生特效预览](classic-effects-preview.png)及[较早时刻](classic-effects-earlier.png)
- `tmp/warcraft-effects/assets-tests.log`、`runtime-tests.log`、`cli-tests.log`
- `tmp/warcraft-effects/native-validation.log`、`native-preview.log`、`release-build.log`

预览由共享编辑器 Game View GPU 渲染器生成，验证实际相机 billboard、缎带、混合与 alpha-key 管线；两张图使用同一批 16 个资源的不同动画时间。图片不是战场整合或完整特效复刻验收。新增原生二进制已构建，已安装的 Tauri 编辑器程序未替换。
