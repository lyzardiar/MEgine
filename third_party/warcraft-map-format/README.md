# Warcraft 地图格式参考

Author: MiYu。

- 源站：[flowtsohg/mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer)。
- 固定提交：`2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。
- 参考路径：`src/parsers/w3x/w3e/{file,corner}.ts`、`wpm/file.ts`、`w3i/` 下信息、玩家、势力、科技及随机表读取器，`doo/{file,doodad,terraindoodad,randomitemset,randomitem}.ts`，以及 `unitsdoo/{file,unit,droppeditemset,droppeditem,inventoryitem,modifiedability,randomunit}.ts`。
- 许可：MIT，原始版权声明保留在 [LICENSE](LICENSE)。此目录不包含第三方可执行依赖。

`scripts/warcraft_map.py`、`scripts/warcraft_doodads.py` 与 `scripts/warcraft_units.py` 依据上述布局实现 Python 读取器，增加版本、字节长度、计数、有限浮点数和文件间尺寸检查。支持经典 W3E 11、WPM 0、W3I 18/25、DOO 7/8及单位放置7/9、8/11。原始字段按源顺序保留，地形高度不经过样例的缩放、栅格化或地形生成逻辑。DOO 采用 1.27 记录布局，不含 1.32 新增的 skin 字段。`war3mapUnits.doo` 单独读取玩家、位置、变体、掉落、背包、能力、资源、英雄属性及随机配置；编辑器放置不代表JASS已经执行。

更新时先核对上游提交及许可，再比较所用布局，补充新版本样例和畸形输入测试；禁止仅放宽版本号检查。运行 `python scripts/test-warcraft-map.py`，以及带 `--maps` 的本地原版地图验证。更新本文件中的固定提交，并同步导入器的 `formatReference`。原版地图、DLL 和提取产物不属于该 MIT 项目；导入产物保存自身来源与摘要，不因格式参考而改变其归属。

装饰布局更新还需运行 `python scripts/test-warcraft-doodads.py --maps <原版 Maps 目录>`，验证每个源 DOO 的逐字节重建；重新导出地图后运行 `test-warcraft-map-reference.mjs`，逐字段核对位置、缩放、状态、掉落集合、地形装饰及独立读取器的重建结果。导出收据记录独立装饰读取器摘要。REA 扩展名与源表引用由 `probe-frost-rea-doodads.mjs` 重现，范围与后续渲染要求见[装饰数据说明](../../docs/designs/frostbound-realms/original-doodads-import.md)。

引擎 REA 来源与维护入口见 [REA 维护说明](../rea/README-MENGINE.md)。静态加载证据由 `node scripts/probe-frost-rea-map-formats.mjs` 重现，证据输出到 `tmp/docs-artifacts/frost-original-maps/`。

单位格式更新使用 `test-warcraft-units.py` 的8种版本／随机模式夹具与指定地图导出，再运行 `test-warcraft-units-reference.mjs <导出目录>`，逐字段及逐字节核对固定上游读取器。只覆盖本次影响的地图；不因更新读取器默认遍历全部地图。`probe-frost-rea-map-formats.mjs --units` 记录本机WorldEdit的文件名入口和脚本生成引用，版本摘要、范围及待实现项见[单位放置说明](../../docs/designs/frostbound-realms/original-map-import.md#单位与物品放置)。

## 地形布局与原生场景

Rust原生实现位于`crates/mengine-assets/src/warcraft_terrain/`，沿用本节固定上游与MIT来源，直接消费挂载MPQ中的SLK／BLP／MDX及W3E。当前覆盖CPU地表／悬崖与图集合成，模板按实际请求增量读取，动态／billboard和不兼容材质明确拒绝；水面及原生视口接入另行验证。定向命令为`cargo test -p mengine-assets --lib native_warcraft_terrain`，真实核心数据／模板／像素对照证据放在`tmp/docs-artifacts/warcraft-archives/`，不提交游戏原始资源或验证快照。Rust地图读取器在相邻`warcraft_map/`，实现W3I18／25、W3E11、WPM0和可选WTS。

`scripts/warcraft_terrain.py` 与 `scripts/build-frost-original-terrain.py` 使用相同固定提交的 `src/viewer/handlers/w3x/map.ts`、地面／水面 shader，核对四角顺序、图集掩码、变体与源高度。坡道入口和双格占用同时参考 [Retera/WarsmashModEngine](https://github.com/Retera/WarsmashModEngine)，固定提交 `f1bcb4ae54f0ff4a8d5e4bd5892b6a6622441b15` 的 `core/src/com/etheller/warsmash/viewer5/handlers/w3x/environment/Terrain.java`。其 MIT 许可保留在 [LICENSE-Warsmash](LICENSE-Warsmash)。原版 MDX 顶点及本仓库已验证的 ClassicCliffs 模板用于生成实际几何。

更新时运行 `python scripts/test-warcraft-terrain.py --project <生成项目>` 与原生 `qa-frost-original-terrain.mjs`。还需检查近景地表混合、四向坡道、接缝和透明水面，不能仅凭字段一致或全景截图验收。

单位视觉转换参考同一固定提交的 `src/viewer/handlers/w3x/{map,unit}.ts`：读取源模型、位置、角度、缩放、移动高度及RGB。单位资源仍来自原地图与本地游戏归档，模型转换工具许可与摘要保留在生成项目。REA字段字符串探针为 `probe-frost-rea-map-formats.mjs --unit-appearance`；生成与真实验收范围见[单位视觉场景](../../docs/designs/frostbound-realms/original-map-import.md#单位视觉场景)，独立预览参考不构成原版运行语义证明。

WPM运行时`game/warcraft-pathing.js`与安装器复用上述格式读取器，保留源32单位路径格、W3E原点及全部基础标志。类型掩码与置位／清位行为来自本机Game.dll（SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`）的REA控制流和限定CPU执行；通过`probe-frost-rea-map-formats.mjs --pathing`、`probe-frost-pathing-cpu.py`重现。更新游戏版本须重新定位函数及验证，不复用旧地址。此依据只覆盖基础标志，不证明完整JASS寻路查询或动态阻挡；范围和测试入口见[运行时说明](../../docs/designs/frostbound-realms/original-map-import.md#原始寻路网格运行时)。
