# Terrain Tile

来自 Unity Technologies [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/6593d544df2ea598e51f5cf1d7165d5ed42ceba7/Assets/Tilemap/Tiles/Terrain%20Tile)，保留官方 64 个单元格、纹理、切片、颜色、方向和初始布局。

在 MEngine 打开本目录并播放。左键绘制，右键擦除，数字键 1 / 2 选择图块，Z 撤销（最多 64 个单元格操作），R 恢复官方初始布局，H 显示/隐藏提示。地形、管道和 Auto Tile 会根据同类型邻居更新连接；Custom Rule Tile 根据地形分组或自定义类型匹配邻居，并保留规则旋转。随机图块按坐标固定，保留源 Sprite 列表和权重。新增随机单元格使用 MEngine 的确定性哈希，不依赖 Unity 随机数实现。原场景为图块功能展示，没有运行时输入；这里增加可操作画笔，运行时修改不写回场景。

场景和贴图 MIT 许可证见 `UNITY-LICENSE.md`；Roboto 字体来源和 Apache 2.0 许可证与 `unity-palette-swap` 相同，许可证随项目放在 `Assets/Fonts/LICENSE.txt`。完整来源见 `SOURCE.json`。

重新导入：`python scripts/import-unity-tiles.py <2d-techdemos checkout>`。原生验收入口 `scripts/qa-unity-tiles.mjs`。
