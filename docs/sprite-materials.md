# Sprite 材质

`SpriteRenderer.material` 和 `AnimatedSprite2D.material` 接受 `.mmat` / `.mat` / `.minst` 项目路径；空值沿用默认精灵渲染。材质字段和逐对象参数均可在 Inspector 中编辑，也可通过 Agent 的组件读写接口操作。

材质使用 `shader: "custom"` 和 `mengine_ui_hook`，与 UI Graphic 共用 2D 着色路径。输入包含精灵纹理 UV、颜色和实例 ID；纹理切片解析后 `uv0` 对应图集区域。`mengine_ui_main_texture(input.uv0)` 读取精灵纹理，`mengine_param_<name>(input.instance_index)` 读取声明的参数。

同实体的 `MaterialPropertyBlock` 可覆盖 `base_color`、已声明的自定义参数及纹理。每个对象拥有独立的值，共享材质资产不变。参数遵循声明的范围，非法数值保留材质值；PC 打包检查名称、数组长度、shader 类型及纹理依赖。逐对象参数通过 GPU 实例数据传递，纹理绑定不同的对象拆分渲染批次。

可运行参考：`samples/unity-tint-brush-smooth`。其 shader 使用九个邻格颜色，在片元中按双线性插值重现官方染色图；运行时画笔更新参数，无需重写贴图或材质文件。原生图像验收入口为 `scripts/qa-unity-tint.mjs`。

自定义 Sprite 材质的 `uv1.xyz` 是插值后的世界坐标；`normal`、`tangent.xyz` 与 `tangent.w` 提供旋转和 Sprite 翻转后的切线空间。图集解析同时变换自定义 `uv0`，保持 diffuse 与辅助 normal 图集对应。`mengine_ui_main_texture` 与辅助贴图均遵循材质的 filter/wrap 设置；默认精灵采样保持原有行为。

`samples/unity-normal-mapping` 展示此路径的逐像素法线着色。场景中的灯光 Transform 由脚本写入 MaterialPropertyBlock，该 shader 自行计算两盏灯，不读取引擎的 Light2D 列表。验收脚本检查原生颜色、Y 翻转后的法线方向、移动灯光、场景切换和重开。
