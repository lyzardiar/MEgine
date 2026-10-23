# Warcraft 地图格式参考

Author: MiYu。

- 源站：[flowtsohg/mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer)。
- 固定提交：`2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。
- 参考路径：`src/parsers/w3x/w3e/{file,corner}.ts`、`wpm/file.ts`、`w3i/` 下信息、玩家、势力、科技及随机表读取器。
- 许可：MIT，原始版权声明保留在 [LICENSE](LICENSE)。此目录不包含第三方可执行依赖。

`scripts/warcraft_map.py` 依据上述布局实现 Python 读取器，增加版本、字节长度、计数、有限浮点数和文件间尺寸检查。支持经典 W3E 11、WPM 0、W3I 18/25。原始字段按源顺序保留，地形高度不经过样例的缩放、栅格化或地形生成逻辑。

更新时先核对上游提交及许可，再比较所用布局，补充新版本样例和畸形输入测试；禁止仅放宽版本号检查。运行 `python scripts/test-warcraft-map.py`，以及带 `--maps` 的本地原版地图验证。更新本文件中的固定提交，并同步导入器的 `formatReference`。原版地图、DLL 和提取产物不属于该 MIT 项目；导入产物保存自身来源与摘要，不因格式参考而改变其归属。

引擎 REA 来源与维护入口见 [REA 维护说明](../rea/README-MENGINE.md)。静态加载证据由 `node scripts/probe-frost-rea-map-formats.mjs` 重现，证据输出到 `tmp/docs-artifacts/frost-original-maps/`。
