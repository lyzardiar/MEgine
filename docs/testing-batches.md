# Unitypackage 测试批次


### Unitypackage 导入批次：任务 1/3，导入基础

新增 mengine-unity-import 分析/导入 API 与 CLI、固定版本和 SHA256 校验的 FBX2glTF 准备脚本。校验包指纹、GUID/fileID、路径和依赖后，在独立目录暂存并发布；保存源文件、Unity meta、对象映射及产物哈希。重复导入检查实际内容，已有冲突保持不动。Prefab 变换反射 Z 轴，粒子明确记录 Unity 坐标及 sharedMesh 来源；转换 GLB 保持原件，源纹理色彩空间和每轴采样设置写入粒子数据。

必要检查：`cargo test -p mengine-unity-import --lib` 15 通过／0 失败。真实包转换：53 资产、15 节点、11 粒子系统、4 模型、9 运行材质，无缺失运行依赖。FBX 与现有 Unity Editor Mesh 比对，位置/UV/法线误差小于 1.1e-7，Color32 量化后顶点色误差小于 3e-8。17 张实际绑定纹理均双线性且无 mipmap，采样包含 Repeat、Clamp 和混合轴。预览关闭源雾，保留非运行依赖诊断。

证据：`tmp/docs-artifacts/unity-import-samplers/`、`tmp/docs-artifacts/unity-import-inspect/mesh-attribute-fidelity.json`。桌面菜单、模型/材质/Prefab 回归、停止重播、父级变换和渲染在三项任务完成后合并验证。导入通过不代表播放或视觉对照通过。


### Unitypackage 导入批次：任务 2/3，粒子运行时与世界空间渲染

新增版本化 `.mparticle`、ParticleEmitter3D.definition、确定性模拟和世界空间 Mesh/Billboard/Stretch 绘制，旧粒子保持原路径。源 Hermite 曲线、Burst、CustomData、局部/世界空间、完整层级矩阵和序列帧进入模拟。Unity 模式按 20ms 固定步长处理，CustomData 使用前一步年龄；粒子颜色按 Unity Color32/Linear 规则转换。Mesh 读取 sharedMesh 原始几何，保留所有 primitive，修正 X、UV V 和顶点色量化。Billboard Euler、旋转方向、Stretch U 轴及端点锚定来自现有 Editor 的 BakeMesh 数据。

VFX 适配器以共享 WGSL 和参数数据实现本包启用的主纹理、遮罩、扰动、副贴图和溶解；保留各纹理采样、CustomData 通道、HDR、Alpha、双面、Less 深度与关闭深度写入。透明排序读取源 sortingFudge，材质共享独立于单个发射器重播的时钟；定义和网格修改会刷新缓存。非层级缩放模式和未覆盖的启用模块明确诊断，未知 Shader/关键字标为近似。

必要检查：粒子运行时 13/13、资产解析 3/3、WGSL/GPU 2/2 通过。GPU 实测覆盖顶点色×粒子色、Alpha、CustomData、透明排序偏移及普通网格深度遮挡；运行时覆盖首帧 seek、停止/重播、父级非激活、变换、曲线、生命周期、多个 primitive 与 UV。真实技能已生成生命周期帧，最终视觉与桌面交互在第 3 项后统一验证。证据写入 `tmp/docs-artifacts/unitypackage/`。
