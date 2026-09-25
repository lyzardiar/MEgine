# Sprite 材质

`SpriteRenderer.material` 和 `AnimatedSprite2D.material` 接受 `.mmat` / `.mat` / `.minst` 项目路径；空值沿用默认精灵渲染。材质字段和逐对象参数均可在 Inspector 中编辑，也可通过 Agent 的组件读写接口操作。

材质使用 `shader: "custom"` 和 `mengine_ui_hook`，与 UI Graphic 共用 2D 着色路径。输入包含精灵纹理 UV、颜色和实例 ID；纹理切片解析后 `uv0` 对应图集区域。`mengine_ui_main_texture(input.uv0)` 读取精灵纹理，`mengine_param_<name>(input.instance_index)` 读取声明的参数。

同实体的 `MaterialPropertyBlock` 可覆盖 `base_color`、已声明的自定义参数及纹理。每个对象拥有独立的值，共享材质资产不变。参数遵循声明的范围，非法数值保留材质值；PC 打包检查名称、数组长度、shader 类型及纹理依赖。逐对象参数通过 GPU 实例数据传递，纹理绑定不同的对象拆分渲染批次。

可运行参考：`samples/unity-tint-brush-smooth`。其 shader 使用九个邻格颜色，在片元中按双线性插值重现官方染色图；运行时画笔更新参数，无需重写贴图或材质文件。原生图像验收入口为 `scripts/qa-unity-tint.mjs`。
