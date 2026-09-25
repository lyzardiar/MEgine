# Palette Swap

移植自 Unity Technologies [2d-techdemos 的 PaletteSwap](https://github.com/Unity-Technologies/2d-techdemos/tree/6593d544df2ea598e51f5cf1d7165d5ed42ceba7/Assets/Tilemap/PaletteSwap)，保留官方 26 个单元格、三套调色板、纹理和初始 Palette B。

在 MEngine 打开本目录并播放。`1` / 左方向键切换到上一套，`2` / 右方向键切换到下一套，空格随机选择，`R` 重开。Palette A 为鹅卵石、草地和黄砖；B 为紫砖地形、石板和红砖；C 为梯子、动画海面和绿砖。

相邻地形、梯子和海面规则按官方资产计算，海面按源速度 1.5 FPS 播放。固定场景的规则在导入时求值；图块是独立可编辑实体，移动图块不会自动重新求邻接。初始 B 保留源文件缓存的随机图块，其他调色板使用按单元格坐标固定的随机种子和原权重。切换回 B 保持初始外观。

场景与贴图为 MIT，见 `UNITY-LICENSE.md`；提示文字使用 [Google Roboto](https://github.com/googlefonts/roboto-2/blob/main/src/hinted/Roboto-Regular.ttf)，Apache 2.0 许可证见 `Assets/Fonts/LICENSE.txt`。原 UI Toolkit 标签转换为 MEngine Canvas/Text。

导入：`python scripts/import-unity-palette-swap.py <2d-techdemos checkout>`。原生验收：`scripts/qa-unity-palette-swap.mjs`，需设置独立的 `MENGINE_EDITOR_CONFIG_DIR` 和 `MENGINE_EDITOR_EXECUTABLE`。来源与转换范围见 `SOURCE.json`。
