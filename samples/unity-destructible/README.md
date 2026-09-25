# Destructible

移植自 Unity Technologies 2d-techdemos 的 Destructible，保留官方 MIT 地牢、破坏贴图、爆炸动画及 559 个单元格的布局。

打开本工程并播放，在 Game 中点击可沿十字形炸开墙块。外围 Border 不可破坏，地面产生烧焦区域，相邻墙块按规则更新破损边缘。爆炸使用原始 Sprite 动画时间，R 恢复完整地图。

来源见 `SOURCE.json`，许可证见 `UNITY-LICENSE.md`。重新导入场景和数据可在仓库根运行 `python scripts/import-unity-destructible.py <官方仓库目录>`，需要 PyYAML、Pillow 及固定的官方提交版本。
