# Tint Brush

来自 Unity 官方 [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/6593d544df2ea598e51f5cf1d7165d5ed42ceba7/Assets/Tilemap/Brushes/Tint%20Brush)（MIT）。保留 4 个源单元格、Brick 贴图、相机及 4 组颜色。

播放后左键染色、右键还原白色、中键取色；1/2/3/4/5 选择红/绿/蓝/白/橙，B 切换混合强度 100%/50%/0%，Z 撤销（64 次），R 重开，H 显示或隐藏提示。普通 Tint 只修改已有图块；Smooth 修改网格颜色，邻近图块连续过渡。原始画笔属于 Unity Editor，此项目增加运行时操作。

Smooth 将每格周围的九个颜色通过 MaterialPropertyBlock 传入片元 shader，以源 ARGB32 量化、Gamma 混色和双线性插值还原连续 tint map。没有把渐变烘焙到图片。Roboto 字体许可证在 `Assets/Fonts/LICENSE.txt`；场景来源和适配记录见 `SOURCE.json`。

重新导入：`python scripts/import-unity-tint.py <2d-techdemos checkout>`。
