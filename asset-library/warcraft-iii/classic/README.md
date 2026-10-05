# Warcraft III 经典游戏引擎资产

来源为本机 `E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne`，转换日期为 2026-10-05。按照 `war3.mpq → War3x.mpq → War3xLocal.mpq → War3Patch.mpq` 的顺序覆盖同名资源。`asset-sources.json` 记录每个原始文件的包名、路径、字节数和 SHA-256，以及生成资产的 SHA-256。

本次模型范围为已实际导出的 Footman、Grunt、TownHall、LordaeronTree0 四个样例。`SourceAssets/model-inventory.json` 中的 3,264 项是安装包内模型索引，不表示这些模型均已提取或转换。现有 HIVE 素材包保留在集合上级目录。

| 目录 | 内容 |
| --- | --- |
| `SourceAssets/` | 192 个原始文件：184 BLP、4 MDX、4 SLK；保留游戏内部路径。包含红、蓝队色和队伍光晕依赖 |
| `Assets/WarcraftIII/Textures/` | 184 张原始 BLP 解码的 RGBA PNG；独立地形 tile 和队色合成贴图 |
| `Assets/WarcraftIII/Materials/` | 引擎 `.mmat` 材质，使用工程相对贴图路径 |
| `Assets/WarcraftIII/Models/` | 共用地形平面；51 个静态 GLB 部件和 51 个带骨骼动画的 GLB 部件 |
| `Assets/WarcraftIII/Prefabs/` | 四个模型的静态 Stand 状态 prefab，组合部件并隐藏该状态下不可见的 geoset |
| `Assets/WarcraftIII/Animations/` | 12 Hz 的 geoset 可见性、颜色、材质 alpha 和纹理选择采样数据 |
| `Assets/WarcraftIII/Scenes/Preview.mscene` | 地形与四个模型的预览场景 |
| `Assets/WarcraftIII/terrain-catalog.json` | 161 图集、4,065 个 tile 的源裁切范围、独立纹理、材质与默认 tile |
| `Assets/WarcraftIII/model-catalog.json` | prefab、静态/动画部件、队色材质、44 个动画的名称、时长及循环标记 |
| `Licenses/` | 转换工具 MIT 许可、固定源码版本与下载包校验值 |
| `Validation/` | 原 MDX 和序列化 GLB 姿态比对、完整加载测试场景、引擎校验报告和预览 |

## 项目取用

把 `Assets/WarcraftIII` 连同所有 `.meta` 复制到目标项目的 `Assets` 下。`.meta` 使用引擎 schemaVersion 1 和稳定 GUID；GLB、PNG、材质、prefab、场景均有对应元数据。路径使用 `Assets/WarcraftIII/...`，不依赖安装目录或上级目录引用。

地形 tile 是独立的 64×64 RGBA PNG，每张都有材质，避免取样跨越相邻图集块。使用 `Models/TerrainTile.glb` 搭配 tile 材质并设置实体尺寸即可。图集完整保留，索引提供每块的原始行、列和裁切范围；地形自动过渡规则、地图高度、悬崖与水体逻辑由使用项目实现。

模型可直接实例化 `Prefabs/*.prefab`，或根据 `model-catalog.json` 的 `parts` 创建部件。一个部件使用一个 `MeshRenderer` 和对应材质。MDX 的队色底层和原色上层已经合成为单层贴图，`teamMaterials` 提供 `0`（原版红）和 `1`（原版蓝）；需要同时替换模型内所有有此字段的部件。

模型坐标从 MDX 的 Z-up 转为 `(x,z,-y)`，位置及骨骼采用 `1/128` 的单位倍率。这是本集合的换算约定；一块原游戏 128 单位的地形对应本集合平面的一单位。

动画使用部件的 `animatedMesh`，按引擎规则设置 `模型路径#pose=动画索引:帧索引`。动画索引与 catalog 的 `clips` 顺序一致，帧率为 12 Hz。循环动画按时长取模；非循环动画将帧限制在 `0..frameCount-1`，否则引擎的 pose 采样会按时长循环。普通静态 GLB 路径显示 Stand 快照，不会自行播放动画。

骨骼动画与 geoset、材质采样数据分开。播放死亡、建造、升级等动画时，需要按 `stateTracks` 中相同帧的 geoset alpha/颜色和材质 alpha 更新部件可见性与材质状态。不能只切换骨骼 pose 后仍显示所有部件。纹理 V 坐标保留 MDX 的顶向下约定，与引擎 PNG 取样方向一致；不额外翻转贴图。

## 转换范围

保留经典 MDX 几何、最多四个顶点骨骼影响、骨骼层级、44 段动画、RGBA 纹理、透明/裁切/加色材质、红蓝队色、Stand 可见性及全部原始文件。Hermite/Bezier 动画由固定版本的原格式动画器采样为 glTF LINEAR。

Footman、Grunt 的相机 billboard 标记，TownHall 的粒子、灯光、事件、附着物及碰撞信息保留在原 MDX 与索引诊断中。本集合没有将其转换为引擎粒子系统、音效事件或碰撞组件。原游戏材质色调、渲染光照和相机朝向效果仍需在具体项目内验收。

这些是 Blizzard 游戏资产，工具的 MIT 许可不改变游戏资产的使用权限。本机提取与转换记录不构成跨引擎、商用或再分发授权。

## 复现与验证

在仓库根目录执行，需要 Python 3、Pillow、NumPy 和 .NET 10 SDK：

```powershell
python scripts/convert-warcraft-assets.py --input asset-library/warcraft-iii/classic
python scripts/validate-warcraft-assets.py
```

转换工具自动下载固定提交 `4fe46a0772520fc7b55078bf32cda1237d1b5f2e` 的 [W3ModelViewer](https://github.com/Darithos/W3ModelViewer) 源码到 `tmp/warcraft-converter`，使用其解析器和动画器。工具源码、构建目录和中间采样文件不存入资产库。

验证脚本核对全部源文件和生成文件的 SHA-256、tile 逐像素裁切、元数据 GUID、prefab 结构，并从实际 GLB 的 accessor、骨骼层级和 inverse bind 重新计算姿态，和 MDX 动画器的参考顶点比较。BLP JPEG 的四个分量按原始 BGRA 解码，与独立 libjpeg 解码器逐通道比对，保留透明度。随后调用真正的 `mengine-runtime.exe --validate-package`，加载完整校验场景中的 PNG、材质、静态网格及每段动画的首、中、末可表示帧。

验证结果见 [verification.json](Validation/verification.json)。[原生预览](Validation/native-preview.png)由独立后台 Release 编辑器渲染；需要重新捕获时运行 `node scripts/qa-warcraft-assets.mjs`（Node 22+），只使用专用临时项目和专用编辑器配置。无窗口加载与静态预览通过不等于完整游戏中的粒子、动画播放或交互验收。
