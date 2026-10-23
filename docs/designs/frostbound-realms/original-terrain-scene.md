# 原版地图地形的原生场景

Author: MiYu。

`scripts/build-frost-original-terrain.py` 将[原版地图导出](original-map-import.md)编译为可在 MEngine Editor 中打开、Play、暂停和单步的独立项目。地面、原版悬崖／坡道模板和水面按区域合并；默认 32×32 格，也支持 8 和 16。原地图不缩小或重采样，每个地形格为一个引擎单位，坐标统一采用 Warcraft `(X,Y,Z)` → MEngine `(X,Z,-Y)/128`。

当前完成地形消费路径，原 Frostbound 主场景尚未切换到这些地图。生成项目不包含单位、资源、装饰、岸浪模型、JASS 开局、对局寻路或原版网络同步。整体复刻继续进行，原版实际运行的逐像素视觉一致性尚未证明。

## 数据与渲染

- 从保留地图原件重新解析几何，并核对地图摘要。自定义成员优先于 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq`。成员路径限制在项目的来源目录内。
- `Terrain.slk`、`CliffTypes.slk` 和 `Water.slk` 决定地表、崖壁、腐地及水面资源。相关原件、所属归档、字节数和摘要写入生成项目的 `SourceAssets/`、`terrain-sources.json`。
- 复用已有 253 个 `ClassicCliffs` 模板，核对模板包、目录及实际 MDX 来源摘要。普通悬崖使用 SW/NW/NE/SE 高度模式和源变体；双格过渡模型占用的两个格均移出普通地面。坡道入口的低角点提升半个源层级，过渡模型沿原始起伏场放置。
- 地表按四角材质优先级、原始变体及透明掩码合成64×64图块。图块边界按64像素对齐，0至6级mip保持独立；地表Shader按屏幕导数选级，在每级内夹紧至本图块的半像素边界，再做两级插值。大于6的LOD使用本图块平均值，避免采到整张图集更低级mip中的其他图块。BLP1 JPEG 使用既有转换器的 BGRA 平面解码，保留透明通道；与已有独立 C# 解码图逐分量误差不超过 1/255。
- 地面、崖壁、水面分别按区块和材质合并 GLB。网格保留原始顶点、UV、索引及坐标；不会为每个地形格创建实体。
- 地面法线只累积实际地面三角形，在共享格点平滑；悬崖两侧独立台地保持平面光照，连续起伏和坡道保留真实坡度。
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

### 地表缩小采样隔离

引擎 `create_material_texture_rgba8` 为整张贴图生成mip。地表每图块的采样必须约束到自己的区域；生成器通过64像素对齐、每级夹紧和LOD上限实现隔离，保留PBR光照和区块合并。网格UV仅用于编码图块与局部坐标，Shader恢复每格64像素的导数。该约束修正引擎图集采样，不作为原DLL地表光照或纹理过滤参数的复刻证明。

`test-frost-terrain-atlas.py` 生成六色、3×2图块的原生夹具；`qa-frost-terrain-atlas.mjs <fixture> <terrain-project>` 检查LOD 0／2.5／3／4／5.5／6／8。所有图块的测试区域与其LOD0中心基准逐通道相同；基准包含原生环境光输出。对照路径复现图块串色，最大通道差为201／205。报告 `tmp/docs-artifacts/testing-batches/B001/terrain-atlas-1792729576774.json` 复用 `terrain-atlas-1792729481847.json` 的九张GPU截图，未重复采集已通过输入；夹具为 `tmp/docs-artifacts/warcraft-map-tests/atlas-fixture-3nb2ye_b/`。

Amazonia 更新项目为 `tmp/docs-artifacts/warcraft-map-tests/amazonia-atlas/project/`，只含地形。26个网格的位置／法线／索引和1,502块基础图像逐项相同，UV与材质按新采样布局生成；图集2652²→2496²，基础像素量减少约11.4%。原生全景、近景、重开像素重现、Stop恢复和0 error通过，测试Editor正常退出，复用本批EXE。未重新运行装饰、单位或全库测试；同场景采样成本见下文。

```powershell
python scripts/test-frost-terrain-atlas.py
python scripts/test-frost-terrain-atlas.py --compare-map <旧地形或装饰项目> <新地形项目>
$env:MENGINE_EDITOR_EXECUTABLE=(Resolve-Path target/release/mengine-editor-tauri.exe).Path
node scripts/qa-frost-terrain-atlas.mjs <六色夹具目录> <新地形项目>
```

仅重算截图断言或继续实际地图验收时，可传 `--atlas-report <原GPU报告>`；工具核对夹具路径、地表Shader和EXE摘要及九张输入，再复用原截图。首次运行的夹具缺少MaterialPropertyBlock、绝对零通道断言未计环境光，以及只运行地图时未聚焦Game面板的问题均保留在本地失败报告中；已修正测试入口与断言。

### 水面动画图集隔离

水面帧按原始2幂尺寸对齐，逐级限制LOD至单帧1×1级；双线性过滤跨重复边界时，四个采样点在同一帧内循环，内部区域使用硬件过滤，再插值相邻两级。RGB及alpha均遵循该规则。Amazonia 45帧128²图集由1056×792减至1024×768，基础像素量减少约6%；源帧像素、26个GLB、场景、动画脚本和地面／水深纹理逐字节一致。源ASha动画速率为12帧／秒。

最新地形项目：`tmp/docs-artifacts/warcraft-map-tests/amazonia-water-atlas-v2/project/`。原生报告 `tmp/docs-artifacts/testing-batches/B001/water-atlas-1792730970604.json` 验证真实水动画、暂停稳定、Stop恢复、重新播放像素一致与0 error。它复用已有截图，并核对EXE、生产Shader及夹具输入摘要，未重新构建引擎。

合成夹具使用负坐标、多个重复周期及高对比RGBA帧，检查帧0／7／8／44和LOD 0／2.5／7／10共16组。每个片元在色调映射前对照独立单帧repeat纹理，内部区域全部RGBA绝对误差≤1/256；色调映射后平均通道差≤0.00311，最大差13，不宣称截图逐像素一致。LOD 7／10截图完全一致；旧图集LOD7最大通道差63。最初的截图最大差≤3断言失败已保留，线性误差上限通过实际GPU比较确认，具体硬件过滤差异未单独归因。夹具路径为 `tmp/docs-artifacts/warcraft-map-tests/water-atlas-fixture-nv2ve0xb/`。

```powershell
python scripts/test-frost-water-atlas.py
python scripts/test-frost-water-atlas.py --compare-map <旧水面地形项目> <新水面地形项目>
node scripts/qa-frost-water-atlas.mjs <水面夹具目录> <新水面地形项目>
```

`--reuse-pixels <报告>` 复用摘要一致的固定／参考截图；报告已包含通过的线性比较时，同时核对比较Shader与材质后复用该截图。项目切换需关闭当前项目并等待界面重载，测试仅操作独立临时副本。首次项目切换失败记录保留。

### 同场景图集性能

`qa-frost-atlas-performance.mjs <旧项目> <新项目> Ground|Water` 在同一Editor、相同场景和1280×720下交替采集旧／新材质，顺序为旧、新、新、旧、旧、新；每块8帧，剔除前2帧预热，每视角每模式18个有效帧。使用硬件GPU timestamp，复用本批EXE。

地表报告：`tmp/docs-artifacts/testing-batches/B001/atlas-performance-ground-1792730050507.json`。GPU pass中位数全景1.08268→1.10280ms，近景1.30742→1.32826ms，约增加0.02ms；viewport中位数分别3.71665→3.76260ms、3.70085→3.67690ms。贴图缩小不代表整帧加速，截图视口耗时也不等同游戏FPS。

水面报告：`tmp/docs-artifacts/testing-batches/B001/atlas-performance-water-1792730993831.json`。GPU pass中位数全景1.10208→1.21182ms，近景1.32942→1.44512ms，增加约0.11ms；viewport中位数分别3.66600→3.70685ms、3.70355→3.82500ms。该成本用于帧内循环过滤与mip隔离，未证明整帧提速；两组测试控制台均为0 error，测试Editor正常退出。
