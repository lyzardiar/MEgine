# Normal Mapping

来自 Unity 官方 [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/6593d544df2ea598e51f5cf1d7165d5ed42ceba7/Assets/Tilemap)（MIT）。Built-in / URP 两个场景合计一个演示，均保留 16 格、四个 Sprite 切片、diffuse/normal 图集、相机与两盏灯的源参数。

1/2 切换场景；左/右键移动蓝/橙灯；N 开关法线响应；R 重开；H 隐藏提示。源项目为静态展示，运行时操作是本引擎扩展。URP 初始法线开关遵循源场景的关闭状态。

自定义材质逐像素采样线性法线，世界坐标与切线由 Sprite 渲染器传入。Built-in 使用 Lambert 漫反射、源环境色和解析距离衰减，未复现 Unity Standard 的完整 BRDF 与衰减查找表，不宣称与 Unity 最终像素完全一致。详细适配见 `SOURCE.json`。

导入：`python scripts/import-unity-normal-mapping.py <2d-techdemos checkout>`。验收：`node scripts/qa-unity-normal-mapping.mjs`，需独立编辑器配置环境变量。
