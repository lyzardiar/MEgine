# Brick

移植自 [Unity Technologies 2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/6593d544df2ea598e51f5cf1d7165d5ed42ceba7/Assets/Tilemap/Brick)，使用官方 MIT 贴图、128 块砖的场景布局与配色。

在 MEngine 打开本目录并播放。A/D 或左右方向键移动挡板，R 重开。球碰到砖块后消除砖块，落到底部触发区后重开场景。

每块砖转换为可编辑 Sprite 和 2D 碰撞体。挡板采用运动学方框碰撞体；官方版本为约束 Y 位置的动态多边形。球初始水平速度固定为 1.5，便于复现与 Agent 验收。完整来源见 `SOURCE.json`，复制资源的许可证见 `UNITY-LICENSE.md`。
