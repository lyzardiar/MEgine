# 原版地图读取与来源维护

Author: MiYu。

`scripts/import-frost-original-map.py` 从本机原版 `.w3m` / `.w3x` 生成可验证的 `map.json`，保留源地图、提取成员和 SHA-256。输入地图只读；输出要求新目录，完整写入临时目录后再发布。默认产物位于 `tmp/docs-artifacts/frost-original-maps/<地图文件名>/`。

该阶段完成离线格式读取。`coverage.runtimePlayable` 为 `false`：现有 Frostbound 模拟仍使用 32×32 地形、双队状态和 160 单位上限；导入结果尚未接入遭遇战、寻路、渲染、存档或联机。装饰、单位和 JASS 保留原件，尚未执行或解释。不会将导入结果加入现有地图菜单。

## 支持的布局

| 数据 | 已读取字段 |
|---|---|
| 地图容器 | 直接 MPQ，或 512 字节 `HM3W` 包装头后的 MPQ；复用 `scripts/warcraft_mpq.py` |
| W3E 11 | 原始矩形尺寸、原点、地表／悬崖材质 ID、每个顶点的高度、水位、边界、坡道、腐地、纹理与变体、悬崖层级 |
| WPM 0 | 原始尺寸和全部路径字节，包括当前未解释的位；每个地形格对应 4×4 路径格 |
| W3I 18/25 | 地图信息、相机边界、可玩范围、玩家槽和起点、势力、科技及升级限制、随机单位／物品表、资料片环境参数 |
| WTS | UTF-8／BOM、多行文本、记录间和记录头注释；保留 `TRIGSTR` 原字段并提供字符串表 |

`map.json` 使用 `schema=mengine.warcraft-map`、`schemaVersion=1`。`terrain.corners` 按源文件行序排列，每项为 `[i16地面高度,u16水位,u8纹理标志,u8变体,u8悬崖层级]`，包括保留位。`terrain.vertexSize` 是顶点数，`tileSize` 为顶点数减一。`pathing.cells[y*width+x]` 保存源字节。

坐标保持 Warcraft XY，不转换为引擎 XZ。左下原点来自 W3E，地形格边长 128，路径格边长 32；路径查询使用左闭右开范围，地图外返回 `None`。`corner_at` 的高度值采用格式参考的归一化值 `(raw-8192)/512`，并单独保留悬崖层级；它不代表已经完成原版地形表面的采样、坡道或悬崖网格生成。

未知版本、截断、无效计数、非有限坐标、尺寸不一致、额外二进制尾部均拒绝。无法完整解析的可选 WTS 原件仍保留，`diagnostics` 记录问题，`coverage.strings=preserved-unparsed`，字符串引用不替换。缺失可选成员标为 `absent`。

## REA 与独立格式参考

- [REA 源站、固定版本与维护](../../../third_party/rea/README-MENGINE.md)：`morluto/rea` 6.5.0。
- Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。
- `node scripts/probe-frost-rea-map-formats.mjs` 使用真实 REA MCP，确认 `.w3e/.wpm/.w3i` 字符串及引用。`0x6f76e9da` 构造地形路径后调用 `0x6f72f180`；`0x6f76eb7c` 构造路径文件名、调用 `0x6f819118` 并存在 `Path.tga` 回退；`0x6f6f0dfc` 把信息后缀传给 `0x6f702d60`。地址仅对上述 DLL 有效。
- 这些指令证明加载引用，不单独证明字段布局或原版运行行为。当前导入器要求 WPM，不实现 `Path.tga` 回退。
- [格式源站、固定提交及 MIT 许可](../../../third_party/warcraft-map-format/README.md)：`flowtsohg/mdx-m3-viewer`，提交 `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。

## 复现与验证

```powershell
python scripts/test-warcraft-map.py
python scripts/import-frost-original-map.py 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/(2)BootyBay.w3m' --output tmp/docs-artifacts/frost-original-maps/booty-bay
python scripts/import-frost-original-map.py 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/FrozenThrone/(2)Amazonia.w3x' --output tmp/docs-artifacts/frost-original-maps/amazonia
node scripts/test-warcraft-map-reference.mjs tmp/docs-artifacts/frost-original-maps/booty-bay tmp/docs-artifacts/frost-original-maps/amazonia
python scripts/test-warcraft-map.py --maps 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps'
```

独立参考检查需要网络及编辑器的 TypeScript 开发依赖。它下载固定提交下的 18 个解析模块到临时证据目录，记录每个模块的摘要，再执行原 TypeScript 读取器，逐字段比较导出内容。参考源码不会成为游戏运行时依赖。

2026-10-23 验证：

- 9 组单元测试通过：完整截断位置遍历、非方形坐标、边界、保留位、两个 W3I 版本、非空随机表、非法计数／版本／浮点数、字符串、两种容器头、来源摘要、原件保留与输出目录保护。
- 298 张本地地图中 296 张完成 W3E/WPM/W3I 读取，包含 W3I 18 的 89 张和 W3I 25 的 207 张；W3E 与 WPM 全部逐字节重建一致。宽 64–480 格，高 64–416 格。
- `Download/DotA v6.77b AI 1.4 CN.w3x` 和 `Download/DotA_v6.83d.w3x` 的 W3I 在读取后续表时截断，明确拒绝。因此全目录验证命令返回 1，不能报告全量通过。
- 3 张地图的 WTS 存在当前语法不接受的内容：`NightElfX01`、`UndeadX03`、`(10)ExtremeCandyWar2004`。几何和信息成功读取，原字符串保留并报告警告。
- 从 JASS 常量找到 1,647 个与 W3I 一致的起点；9 张自定义地图存在不同起点，8 张没有可匹配的常量调用。此比较记录源差异，不能代替脚本执行或动态开局验证。
- 独立解析器检查：Booty Bay 的 18,721 个顶点、294,912 路径字节及 W3I 18 信息全部一致；Amazonia 的 9,409 个顶点、147,456 路径字节及 W3I 25 信息全部一致。
- Booty Bay 为 192×96 地形、768×384 路径格，玩家起点为 `[-8384,1792]`、`[8448,2048]`；源地图摘要 `3180a12a1df1cbacc3c11da9260e35fff2a3fe53314f63155e5f0735b2408b9e`。

证据：`tmp/docs-artifacts/frost-original-maps/{tests.log,corpus.json,rea-summary.json,reference-check/report.json}`，以及两个导出目录。该阶段没有修改游戏逻辑或引擎生产代码，没有新增原生 Editor／Player 运行验收，也不声明帧率改善。

后续接入需同时处理任意地图尺寸、原版路径格、原点和轴向、地形网格与材质、玩家槽、资源与装饰、脚本开局、序列化及网络协议；使用本阶段原件和坐标作为验证依据，避免通过缩小地图获得表面兼容。

原生地形消费入口已实现，见 [原版地形场景](original-terrain-scene.md)：保留地图尺寸、原版地表／悬崖／坡道／水面，生成独立 MEngine 项目；完整对局执行继续推进。
