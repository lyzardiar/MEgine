# Unitypackage 测试批次


### Unitypackage 导入批次：任务 1/3，导入基础

新增 mengine-unity-import 分析/导入 API 与 CLI、固定版本和 SHA256 校验的 FBX2glTF 准备脚本。校验包指纹、GUID/fileID、路径和依赖后，在独立目录暂存并发布；保存源文件、Unity meta、对象映射及产物哈希。重复导入检查实际内容，已有冲突保持不动。Prefab 变换反射 Z 轴，粒子明确记录 Unity 坐标及 sharedMesh 来源；转换 GLB 保持原件，源纹理色彩空间和每轴采样设置写入粒子数据。

必要检查：`cargo test -p mengine-unity-import --lib` 15 通过／0 失败。真实包转换：53 资产、15 节点、11 粒子系统、4 模型、9 运行材质，无缺失运行依赖。FBX 与现有 Unity Editor Mesh 比对，位置/UV/法线误差小于 1.1e-7，Color32 量化后顶点色误差小于 3e-8。17 张实际绑定纹理均双线性且无 mipmap，采样包含 Repeat、Clamp 和混合轴。预览关闭源雾，保留非运行依赖诊断。

证据：`tmp/docs-artifacts/unity-import-samplers/`、`tmp/docs-artifacts/unity-import-inspect/mesh-attribute-fidelity.json`。桌面菜单、模型/材质/Prefab 回归、停止重播、父级变换和渲染在三项任务完成后合并验证。导入通过不代表播放或视觉对照通过。


### Unitypackage 导入批次：任务 2/3，粒子运行时与世界空间渲染

新增版本化 `.mparticle`、ParticleEmitter3D.definition、确定性模拟和世界空间 Mesh/Billboard/Stretch 绘制，旧粒子保持原路径。源 Hermite 曲线、Burst、CustomData、局部/世界空间、完整层级矩阵和序列帧进入模拟。Unity 模式按 20ms 固定步长处理，CustomData 使用前一步年龄；粒子颜色按 Unity Color32/Linear 规则转换。Mesh 读取 sharedMesh 原始几何，保留所有 primitive，修正 X、UV V 和顶点色量化。Billboard Euler、旋转方向、Stretch U 轴及端点锚定来自现有 Editor 的 BakeMesh 数据。

VFX 适配器以共享 WGSL 和参数数据实现本包启用的主纹理、遮罩、扰动、副贴图和溶解；保留各纹理采样、CustomData 通道、HDR、Alpha、双面、Less 深度与关闭深度写入。透明排序读取源 sortingFudge，材质共享独立于单个发射器重播的时钟；定义和网格修改会刷新缓存。非层级缩放模式和未覆盖的启用模块明确诊断，未知 Shader/关键字标为近似。

必要检查：粒子运行时 13/13、资产解析 3/3、WGSL/GPU 2/2 通过。GPU 实测覆盖顶点色×粒子色、Alpha、CustomData、透明排序偏移及普通网格深度遮挡；运行时覆盖首帧 seek、停止/重播、父级非激活、变换、曲线、生命周期、多个 primitive 与 UV。真实技能已生成生命周期帧，最终视觉与桌面交互在第 3 项后统一验证。证据写入 `tmp/docs-artifacts/unitypackage/`。


Unitypackage 同任务收尾补充：导入器 1.3.0 将原始资产移至工程级 `SourceAssets/UnityPackages/`，暂存目录也置于 Assets 外，采用两目录发布与本次文件回滚。所有运行资产生成独立 MEngine JSON meta，纳入 manifest；20 项导入测试通过。真实注册表连续重建两次，49 个原生 GUID 与 Unity GUID 无重叠，sidecar 字节不变，再次导入复用成功；清单为 runtime 97 项及 source 163 项。证据 `tmp/docs-artifacts/unity-import-v1-3-metadata/`。材质顶点流按实际序列解码并校验，不匹配的 CustomData 排布阻断。寿命精确端点浮点残留补充测试 1/1 通过；未知 Shader 显示紫色棋盘预览。以上均为前两任务补充，不增加批次计数。


### Unitypackage 导入批次：任务 3/3，桌面入口与预览 sample

桌面 Assets 菜单增加 Unity Package 分析/导入，支持文件选择或直接输入路径，锁定目标工程并校验指纹，完成后统一刷新和定位结果。组件目录和 Inspector 增加 `.mparticle` 资产引用；Project 双击定义打开带 revision/工程守卫的 JSON 编辑器。资产重命名引用扫描与 Player 打包追踪定义、模型及材质纹理。构建 SDK 部署固定转换器与许可。

`samples/unity-package-preview` 提供中性 3D 场景、HUD、播放/停止/重播、相机环绕/缩放及背景切换。`prepare-preview.mjs` 将已有导入复制到忽略的 LocalPreview 工程，保留独立源资产目录；专有特效不入 Git。增加 native QA 脚本与 GPU 截图示例，所有产物写入 tmp/docs-artifacts。

快速检查：前端 production build、Tauri cargo check 通过；导入模型与 Player 依赖检查 7/7 通过。三项任务已齐，统一原生验证正在执行：真实指定路径的分析/导入、刷新后复导、Prefab 实例化、播放与 X/R、相机、JSON 参数保存/非法拒绝、保存重开和控制台检查。GPU/Unity 同条件对照另行记录；不将成功播放计为视觉还原通过。

### Unitypackage 导入批次：集成验证结论

实现范围为提交 9349e60、f1fb4aa、dcf9bd1、4ecf99b 及本次同任务收尾。导入器 1.4.0 按 Shader 和 6 个项目 HLSL 的原始字节签名选择适配器，相同内容更换 GUID 仍复用；修改或缺失任一已核验源码则降为近似。原包及 5 个变体均完成真实导入和无转换器重复导入校验，证据为 `tmp/docs-artifacts/unity-import-shader-signature/verification.json`。包外 URP 版本保持未核验，适配基线为本地参考工程 14.0.11。

收尾修复非循环连续发射在 duration 终点多生粒子、预览首次绘制丢失已推进时间及 HUD 根布局。预览脚本显式传递采样时间与重播代次，隐藏窗口或跳过中间显示帧也能清空和重播；世界空间粒子重播后重新捕获出生变换；残余步已显示粒子的出生矩阵保留至完整步提交，覆盖暂停父移动、倒退及 rate/Burst 混合发射。定向检查通过：导入 24、粒子定义 3、导入粒子运行时 17、视口时钟 2、粒子 GPU 2、前端导入及依赖 7；常规材质 13、Prefab 2、旧粒子 6、普通排序及材质管线状态各 1 通过。前端 production build、sample 实际 TypeScript 消费编译通过。原始日志保存在 `tmp/docs-artifacts/unitypackage/`。

最终 Windows 原生报告 `tmp/docs-artifacts/unity-import/native-1792812257761/report.json` 通过：真实指定包的路径分析/导入、资产刷新后复导、错误指纹和过期工程拒绝、定义资产引用、JSON 非法拒写/合法保存、Prefab 实例化、相机和背景、停止/重播及保存关闭重开。原生 readback 的首次播放对象数 40、清空 0、重播 38、3 秒结束 0；Shader 拒绝 0，Console 错误 0。截图中效果可见、HUD 无重叠。自有测试实例隐藏且正常退出，原用户 Editor 保持运行。系统文件选择器未执行；路径输入入口实际执行。

本次原生编译和链接完成，最终复制到被运行进程占用的 target/debug EXE 时失败；已从新链接的 deps 产物复制到独立 `tmp/docs-artifacts/unitypackage/native-bin-verified/mengine-editor-tauri.exe` 并完成上述 QA，SHA256 为 `7a37c652041512872de1ba5fe04516e3b18098fb618a0e8b2e7ef0d641e6a31a`。修复版播放复测报告为 `tmp/docs-artifacts/unity-import/native-1792812650675/report.json`，首次播放/清空/重播/结束对象数仍为 40/0/38/0，保存重开通过，错误 0；导入和 UI 检查复用前述完整报告。残余步出生回归证据为 `tmp/docs-artifacts/unitypackage/residual-birth-verification.md`。这是开发构建验收，正式 SDK/安装包的转换器资源分发尚未验收。

结果分列：**导入成功、播放通过、视觉对照待验收**。结构为 53 资源、15 Prefab 节点、11 粒子系统、4 模型和 9 运行材质，运行依赖已解析。相同相机、背景、Linear 处理及材质动画时间下，Unity 和 MEngine 均采样 0.1/0.3/0.6/1/1.5/3 秒；MEngine 绘制数为 13/17/19/28/10/0。0.6 秒所有粒子系统计数与 Unity 一致，精确寿命端点采用明确浮点容差；部分帧仍有粒子分布、环形纹理和消散外观差异，不能判为视觉还原通过。无雾、无曝光后处理；不保证与 Unity 相同随机序列。对照位于 `tmp/docs-artifacts/unitypackage/unity-reference/`、`mengine-reference-complete/`，逐系统计数位于 `particle-count-comparison.tsv`。

可直接打开 `samples/unity-package-preview/LocalPreview/project.json` 实验本次导入；其中专有美术资产和 SourceAssets 仅保留本地。长期维护的空 sample、导入工具及说明纳入提交。本批集成执行完成，剩余视觉差异和正式分发验收保持待测，不计作通过。

### Unitypackage 主干集成验证

以主干 `ecebf76` 为基线，纳入本功能五项提交 `9fbd094`、`c92f3e8`、`7a9ae2b`、`be044ba`、`cc220c8`。沿用主干材质、纹理绑定与 FrameCompiler 接口；导入粒子使用独立播放时钟，桌面刷新使用主干资产 API。原生 QA 使用独立运行目录和通用实例关闭助手。

主干定向验证通过：导入器 24/24、导入运行时 17/17、WGSL/实际 GPU 2/2、播放时钟 2/2、前端导入及打包依赖 7/7。粒子回归 20/20（包含 14 项导入模拟测试及 6 项旧粒子测试，与运行时结果存在覆盖重叠，不累计计数）。前端 production build、CLI 构建、JS 语法和 PowerShell 解析检查通过。

Windows 主干原生完整 QA 通过：真实包分析/导入、重复导入、包指纹及工程守卫、定义引用与 JSON 编辑、播放/清空/重播、相机/背景、保存关闭重开均执行。清单为 53 资产、1 Prefab、11 粒子系统、4 模型和 21 纹理；播放/清空/重播/结束对象数为 40/0/38/0，控制台错误和材质管线拒绝均为 0。自有隐藏测试实例正常退出。

原生编译及链接成功，Cargo 最终复制目标 EXE 因现有用户进程占用失败；从本次新链接的 deps EXE 复制独立程序执行完整 QA，未关闭用户实例。已验证程序 SHA256 为 `AB37CC09500F2D5FEA9023384CAA3825140A814C95FDEF02B0768A9BB0AEC0A7`。日志、截图、报告及该程序保存在 `G:/work/github/MEgine/tmp/docs-artifacts/unitypackage-mainline/`，完整原生报告为 `native-full/report.json`。

主干结果：导入成功、播放通过；Unity 视觉还原仍待验收，系统文件选择器及正式 SDK/安装包分发未执行。本项为同功能主干适配与验证，不新增待测任务计数。
