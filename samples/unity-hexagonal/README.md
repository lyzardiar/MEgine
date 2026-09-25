# Hexagonal

来自 Unity 官方 [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/6593d544df2ea598e51f5cf1d7165d5ed42ceba7/Assets/Tilemap/Hexagonal)（MIT）。保留 400 个海洋格、96 个陆地格及 38 条海岸规则，含 28 个水平镜像源格。

左键在海洋上添加陆地，右键删除陆地，海岸实时重算；Z 撤销（64 次），R 重开，H 显示/隐藏提示。原始场景为编辑器图块展示，此处增加运行时画笔。相机自动框选全图，网格大小、奇偶行偏移、Sprite 尺寸和层级顺序保持源数据。

坐标公式已用隔离 Unity 2022.3.47f1c1 的 Grid.CellToLocal 实测核对。来源和适配见 `SOURCE.json`，许可证见 `UNITY-LICENSE.md` 和 `Assets/Fonts/LICENSE.txt`。导入：`python scripts/import-unity-hexagonal.py <2d-techdemos checkout>`。
