# Unitypackage 测试批次


### Unitypackage 导入批次：任务 1/3，导入基础

新增 mengine-unity-import 分析/导入 API 与 CLI、固定版本和 SHA256 校验的 FBX2glTF 准备脚本。校验包指纹、GUID/fileID、路径和依赖后，在独立目录暂存并发布；保存源文件、Unity meta、对象映射及产物哈希。重复导入检查实际内容，已有冲突保持不动。Prefab 变换反射 Z 轴，粒子明确记录 Unity 坐标及 sharedMesh 来源；转换 GLB 保持原件，源纹理色彩空间和每轴采样设置写入粒子数据。

必要检查：`cargo test -p mengine-unity-import --lib` 15 通过／0 失败。真实包转换：53 资产、15 节点、11 粒子系统、4 模型、9 运行材质，无缺失运行依赖。FBX 与现有 Unity Editor Mesh 比对，位置/UV/法线误差小于 1.1e-7，Color32 量化后顶点色误差小于 3e-8。17 张实际绑定纹理均双线性且无 mipmap，采样包含 Repeat、Clamp 和混合轴。预览关闭源雾，保留非运行依赖诊断。

证据：`tmp/docs-artifacts/unity-import-samplers/`、`tmp/docs-artifacts/unity-import-inspect/mesh-attribute-fidelity.json`。桌面菜单、模型/材质/Prefab 回归、停止重播、父级变换和渲染在三项任务完成后合并验证。导入通过不代表播放或视觉对照通过。
