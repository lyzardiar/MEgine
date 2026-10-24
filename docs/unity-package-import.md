# Unity Package 导入与预览

桌面菜单 **Assets → Import Unity Package...** 分两步分析、导入。分析显示资源和依赖、包 SHA256 及兼容性诊断；导入时重新校验包，完成全部转换后统一刷新并定位 Prefab。首次 FBX 转换使用随安装包部署的固定 FBX2glTF，运行导入无需 Unity Editor 或 Python。开发仓库使用 `python scripts/prepare-unity-import.py` 准备该工具。

源资产保存在 `SourceAssets/UnityPackages/`，运行资产保存在 `Assets/Imported/`。Unity GUID/fileID 是来源身份，独立 MEngine meta 是运行资产身份。manifest 保存来源、转换器版本和源/产物哈希。重复导入只复用完整且未修改的结果；冲突要求另选工程目录或明确处理本地资产，导入器不会覆盖用户文件。

## 跨包 Shader 复用

不同包的相同适配器在同一渲染器中共享 WGSL 模块，并按混合、深度比较、深度写入和剔除状态缓存 GPU 管线。颜色、纹理、UV 和 CustomData 等参数分别绑定，不为每个材质数值生成 Shader。Shader/HLSL 原文件仍随各包独立归档，模型和纹理也不做跨包内容去重。

导入器 1.4.0 用已核验 Shader 及其 6 个项目 HLSL 依赖的原始字节 SHA256 识别适配器；同内容不同 GUID 可以复用，同 GUID 但内容变化或依赖缺失则报告近似并使用预览材质。源签名及外部依赖写入材质转换结果。URP 库以参考工程 14.0.11 为适配基线，包未携带的 URP 库不视为已验证，其他版本不保证等价。这是已知 Shader 的专用适配，不是通用 HLSL 编译器。

## 预览 sample

打开 `samples/unity-package-preview/project.json`，导入后双击 Prefab 实例化，再按 Play。Space 播放/停止，X 停止并清空，R 重播，方向键环绕/抬高视角，W/S 缩放，Home 复位，B 切换背景。HUD 显示时间及导入粒子数。保存场景即可保留实例。

已有 CLI 导入结果可运行：

```powershell
node samples/unity-package-preview/prepare-preview.mjs <导入结果所在工程目录>
```

打开生成的 `samples/unity-package-preview/LocalPreview/project.json` 即可预览。生成器拒绝覆盖已有目录。LocalPreview、原包和导入美术资源均被 Git 忽略；仓库只保存空预览场景、控制脚本及有许可证的 HUD 字体。

sample 用 `playback_time` 明确指定导入粒子的采样秒数，用 `playback_generation` 标记重播，因此暂停、批量步进和隐藏窗口不需要绘制中间帧来传递重播状态。普通导入组件的 `playback_time` 默认 -1，使用自动播放时钟；这两个字段不改变无定义引用的旧粒子。

## 当前兼容范围

- 版本 1 的 `.mparticle` 定义模拟与材质参数，ParticleEmitter3D.definition 引用资产；旧粒子组件保持原行为。
- 支持当前技能使用的常量/双常量/Hermite/双曲线、Burst、Shape、颜色/尺寸/旋转、速度限制、序列帧和 CustomData。Unity 坐标模式采用 20ms 确定性模拟步长，固定种子保证引擎内重现，不保证 Unity 随机序列一致。
- 支持世界空间 Mesh、Billboard 和 Stretch，Mesh 保留顶点色与所有 primitive；使用实际场景深度、透明排序及源采样器。模型 GLB 与 Unity sharedMesh 使用显式不同的加载语义。
- `VFX/EffectURP_V2_3D` 适配当前包启用的主纹理、遮罩、扰动、副纹理、溶解及粒子自定义通道。未知 Shader/关键字报告近似；不支持的启用粒子模块、加权曲线、非层级缩放和无法唯一映射的多网格 FBX 明确阻断。
- 首期以 Windows 原生编辑器/运行时为验收环境。场景雾、曝光和后处理不进入技能对照；C#、Animator、通用嵌套 Prefab/Variant、任意 Shader 自动转换不在当前范围。

## 验证入口

```powershell
cargo test -p mengine-unity-import --lib
cargo test -p mengine-assets --lib particle_definition
cargo test -p mengine-runtime --lib imported_particle
cargo test -p mengine-rhi --lib particle_render::tests
node scripts/qa-unity-package-import.mjs <当前编辑器exe> <源unitypackage>
```

GPU 截图入口为 `cargo run -p mengine-runtime --example unity_package_preview -- <工程目录> <Prefab相对路径> <输出目录> [Unity参考manifest]`。参考 manifest 提供相同材质动画时钟；相机、Linear 色彩、背景及后处理条件固定。结果必须分别报告导入成功、播放通过和视觉对照状态。测试批次记录见 [testing-batches.md](testing-batches.md)，原始截图和报告保存在 `tmp/docs-artifacts/unitypackage/` 及 `tmp/docs-artifacts/unity-import/`。
