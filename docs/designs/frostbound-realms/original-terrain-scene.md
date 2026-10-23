# 原版地图地形的原生场景

Author: MiYu。

`scripts/build-frost-original-terrain.py` 将[原版地图导出](original-map-import.md)编译为可在 MEngine Editor 中打开、Play、暂停和单步的独立项目。地面、原版悬崖／坡道模板和水面按区域合并；默认 32×32 格，也支持 8 和 16。原地图不缩小或重采样，每个地形格为一个引擎单位，坐标统一采用 Warcraft `(X,Y,Z)` → MEngine `(X,Z,-Y)/128`。

当前完成地形消费路径，原 Frostbound 主场景尚未切换到这些地图。生成项目不包含单位、资源、装饰、岸浪模型、JASS 开局、对局寻路或原版网络同步。整体复刻继续进行，原版实际运行的逐像素视觉一致性尚未证明。

## 数据与渲染

- 从保留地图原件重新解析几何，并核对地图摘要。自定义成员优先于 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq`。成员路径限制在项目的来源目录内。
- `Terrain.slk`、`CliffTypes.slk` 和 `Water.slk` 决定地表、崖壁、腐地及水面资源。相关原件、所属归档、字节数和摘要写入生成项目的 `SourceAssets/`、`terrain-sources.json`。
- 复用已有 253 个 `ClassicCliffs` 模板，核对模板包、目录及实际 MDX 来源摘要。普通悬崖使用 SW/NW/NE/SE 高度模式和源变体；双格过渡模型占用的两个格均移出普通地面。坡道入口的低角点提升半个源层级，过渡模型沿原始起伏场放置。
- 地表按四角材质优先级、原始变体及透明掩码合成图集，并保留边缘填充。BLP1 JPEG 使用既有转换器的 BGRA 平面解码，保留透明通道；与已有独立 C# 解码图逐分量误差不超过 1/255。
- 地面、崖壁、水面分别按区块和材质合并 GLB。网格保留原始顶点、UV、索引及坐标；不会为每个地形格创建实体。
- 水面采用源 W3E 水位、`Water.slk` 高度偏移、帧序列、速率、重复格数和浅／深水颜色。顶点深度以 float32 位模式存入 data 纹理；Shader 先计算四个顶点颜色，再按源三角形插值。脚本仅在动画帧变化时发布材质参数，并通过名称获取真实运行时实体 ID。
- 输出要求新目录，完整生成后再发布；已有输出保留。未知模板、源件变更和超出贴图限制均报错，不以替代模型继续导入。

地图布局和地面／水面参考的 GitHub 源站、固定提交及 MIT 许可见 [地图格式维护](../../../third_party/warcraft-map-format/README.md)。REA 的 DLL 加载入口证据沿用地图导入阶段。来源参考的语义与当前引擎运行验证分别记录，不代表原版完整运行行为已验收。

## 使用与重建

```powershell
python scripts/import-frost-original-map.py 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/(2)BootyBay.w3m' --output tmp/docs-artifacts/frost-original-maps/booty-bay
python scripts/build-frost-original-terrain.py tmp/docs-artifacts/frost-original-maps/booty-bay --output tmp/docs-artifacts/frost-original-terrain/booty-bay
python scripts/test-warcraft-terrain.py --project tmp/docs-artifacts/frost-original-terrain/booty-bay
node scripts/test-frost-original-terrain-client.mjs tmp/docs-artifacts/frost-original-terrain/booty-bay
$env:MENGINE_EDITOR_EXECUTABLE=(Resolve-Path target/release/mengine-editor-tauri.exe).Path
node scripts/qa-frost-original-terrain.mjs tmp/docs-artifacts/frost-original-terrain/booty-bay
```

在编辑器中打开生成目录的 `project.json`。需要保留新版本时指定新的输出目录。生成物可按需放到样例内，但验证项目、截图和原始采样默认留在 `tmp/docs-artifacts/`；这些文件不提交到 `docs/`。

## 已验证范围

2026-10-23：8 组 Python 测试通过，覆盖 64 种普通悬崖模式的 8 档变体选择、四向过渡占用、非方形坐标、输入不变性、纹理位、坡道入口、模板轴向、非法材质槽与 BLP alpha。客户端测试验证运行时实体 ID、15 FPS 参数发布、未变化帧无命令、暂停和重开。

| 原版地图 | 地形格 | 原生实体／网格 | 顶点／三角形 | 地面—崖壁接缝采样 | 最大高度误差 |
|---|---|---|---|---|---|
| Booty Bay | 192×96 | 54／52 | 133,615／75,867 | 18,705 | 0.000000791014 |
| Amazonia | 96×96 | 28／26 | 75,889／41,076 | 6,165 | 0.000000703125 |

Booty Bay 包含 15,999 个普通地面格、2,413 个悬崖实例（其中 20 个双格坡道过渡）、83 个坡道入口及 4,527 个水格。全部格子被地面或悬崖占用，二者无重叠；接缝误差低于半个 Warcraft 源单位，即 0.00390625 引擎单位。每个输出 GLB 的索引范围、有限坐标、地面朝向及原始高度一致；水深纹理逐位一致。

两图均通过真实原生 Editor 的加载、源水帧变化、Stop 恢复、重开像素重现和斜视近景检查，控制台 error 为 0，测试进程正常退出。WebView 缓存锁定时保留缓存。源码主场景和用户已有工作区改动保持原样。

分块性能、采样口径和限制见[性能 TODO 第二十三阶段](../../performance-risk-todo.md)。原版地形之外，后续还需完成资源／装饰及单位布置、地图玩家槽、实际地图寻路和脚本执行，再接入默认遭遇战、存档与网络协议。

最终可打开项目：`tmp/docs-artifacts/frost-original-terrain/camera-fit/booty-bay/`、`camera-fit/amazonia/`。原生报告、截图、几何报告和分块对照位于同一任务目录。默认相机适配这两种地图比例，Amazonia近景选用地图内部崖壁。
