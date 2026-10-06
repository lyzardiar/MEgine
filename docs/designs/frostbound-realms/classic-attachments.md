# 原版模型挂点与显隐轨道

作者：MiYu

`classic-attachment-ready` 为战场已使用的 94 个源模型补齐完整节点层级。577 个动画 GLB 保留原几何、法线、UV、索引、蒙皮 joint 索引、inverse bind 和动画二进制缓冲；追加未参与蒙皮的源节点，并保留其原始变换轨道。602 个附件节点含原始 attachment ID 和内置模型路径，其中 252 个带 KATV 显隐轨道，15 个具有非空内置模型路径。

`GltfPoseSource::sample_nodes(clip, frame, rate, camera)` 返回节点索引、名称、模型空间矩阵及附件信息。节点姿态与网格求值共用一个实现，使用原始变换关键帧、父子层级、源动画窗口、循环/终点保持和相机朝向规则。名称可以重复；调用者使用索引区分节点。可传入相机及实例模型矩阵，查询与渲染同一视角下的相机朝向节点。返回矩阵的平移为源节点枢轴的当前位置。

附件 `visibility` 仅描述源 ATCH 定义中内置模型的可见性；外加技能效果仍可使用该节点的位置。空 `path` 是有效的参考节点，零 visibility 也不表示节点不存在。查询提供原始数值，不将其改写成挂点缺失或自动执行外部效果兜底。KATV 支持 step、linear、Hermite、Bezier 与全局序列；缺失或空轨道使用默认值 1。全局轨道当前沿用姿态动画时间，独立持续时钟仍需继续接入。

转换工具拥有独立的 ATCH/KATV 读取器，检查块边界、节点尺寸、重复 object ID、关键帧顺序、有限数值、插值模式和全局序列引用。固定的上游解析器与共享 `G:/work/github/MEgine/asset-library` 保持原样。派生集合使用已核验的 `classic-billboard-ready` 和原始 MDX，保存基集合清单、来源、工具及生成文件的 SHA-256；原有集合的复现链路继续保留。

## 验证与复现

```powershell
dotnet build scripts/warcraft-attachment-metadata/AttachmentMetadata.csproj -p:Wc3Core=<固定版本 Wc3ModelViewer.Core 的绝对路径> -o tmp/warcraft-effects/attachment-metadata
dotnet tmp/warcraft-effects/attachment-metadata/AttachmentMetadata.dll --self-test
python scripts/convert-frost-classic-attachments.py --metadata-reader tmp/warcraft-effects/attachment-metadata/AttachmentMetadata.dll
python scripts/test-frost-classic-attachments.py --metadata-reader tmp/warcraft-effects/attachment-metadata/AttachmentMetadata.dll
python scripts/validate-frost-classic-attachments.py --reference tmp/warcraft-effects/attachment-metadata/AttachmentMetadata.dll --probe <gltf_bounds.exe 的绝对路径>
```

原生探针追加 `--nodes` 时输出节点矩阵、枢轴位置及附件定义，而不生成网格。独立源参考器使用固定 MDX 动画器的世界矩阵变换源枢轴与三个坐标轴，并通过 `SampleFloat` 计算 KATV。验证覆盖全部 94 模型的全部动作、两种相机方向、30/60 Hz、显隐关键帧邻域以及终点与越界保持。每个动画网格部件另取首动作两帧，与基集合的实际原生网格逐顶点比较；GLB 二进制和全部蒙皮定义逐文件保持一致。

- [原始节点与附件对照结果](classic-attachment-validation.json)
- [独立重生成与保护结果](classic-attachment-reproduction.json)

最终验证通过：83 项引擎资产测试、1,670 项源读取器检查、6,356 次原生节点加载和 462,686 个完整节点矩阵对照。最大枢轴位置误差为 `0.0000044037124633522495`，最大矩阵分量误差为 `0.000010144042974502554`；51,221 个可见和 8,754 个隐藏附件样本均与源轨道一致。2,308 次网格加载对照未改变顶点，1,253 个文件独立重生成字节一致，手工改动时拒绝覆盖且其他产物保持原样。编辑器宿主集成检查通过。

Frostbound 已导入完整节点集合，并通过脚本 API `engine.assets.sampleNodes(reference, {camera, attachmentsOnly})` 查询当前动画帧的挂点。`reference` 使用工程相对的 `#pose=clip:frame@rate` 路径；返回节点索引、名称、位置、完整矩阵及附件 ID/path/visibility。编辑器 Play 与独立 Player 设置各自工程根，源和 URI 依赖均检查工程边界。缓存最多 128 个源、256 MiB 输入依赖；单源依赖最多 128 MiB，每帧检查大小与修改时间，切换工程清空缓存。各相机结果独立，单源单帧结果缓存最多 512 KiB。

客户端按实际模型动画、朝向、缩放和策略相机查询 origin、左右手与建筑 sprite 节点，同一单位的状态和技能共享惰性查询。没有效果的单位和健康建筑不触发节点采样。相机朝向仅影响附件参考点时，不重复上传无关几何；影响网格、蒙皮 joint 或其祖先时，仍按相机更新网格。

当前接入挂点位置，特效旋转与缩放沿用单位朝向和比例，尚未继承节点的完整旋转/缩放。15 个非空内置路径指向三种建造 Birth 模型，模型均已在 `remaining-ready`，但内置附件播放及 KATV 驱动仍需接入；独立全局时钟和完整游戏验收仍未完成。

脚本接入验证通过 84 项资产测试与 24 项脚本测试，包含真实 QuickJS API、工程切换、URI 越界拒绝、外部 buffer 热更新、不同相机结果隔离及附件参考点不触发网格重复上传。CLI 构建、独立 Player 检查、状态/技能客户端及真实 TCP 测试通过。

[网格源姿态报告](native-anchor-mesh-pose-validation.json) 覆盖 94 个模型、577 个部件、4 个视角和全部动作，共 73,236 次原生加载、10,122,960 个顶点对照，最大误差 `0.000007660351562410739`。二进制缓冲保持一致；增加完整节点后，恢复原网格节点索引并核对根节点集合，原 GLB 结构一致。[重生成报告](classic-attachment-import-reproduction.json) 记录 1,253 个库文件及 4,956 个导入文件字节一致，手工修改时拒绝覆盖且不改变其他输出。

[原生窗口报告](native-anchor-art-qa.json) 使用当前 Release 编辑器、真实 GPU Game View 与两个 TCP 客户端。单机 35 处、主机 44 处、客机 36 处挂点与同一原子场景快照中的探针结果对照，最大误差 `0.0000007330137989924879`。暂停后特效时间与变换保持一致，8 个回城到达效果、重连和两端材质管线检查通过，拒绝数为 0。画面见 [战场](native-anchor-battlefield.png)、[回城到达](native-anchor-arrival.png)、[联机客机](native-anchor-network.png)。此范围未包含物理鼠标、音频或完整游戏验收。

```powershell
python scripts/import-frost-classic.py --pose-probe <当前 gltf_bounds.exe 的绝对路径>
node scripts/build-frostbound.mjs
python scripts/test-frost-classic-billboards.py --metadata-reader tmp/warcraft-effects/attachment-metadata/AttachmentMetadata.dll --pose-probe <当前 gltf_bounds.exe 的绝对路径>
python scripts/validate-frost-classic-billboards.py --probe <当前 gltf_bounds.exe 的绝对路径>
node scripts/qa-frost-effects.mjs --native-anchors
```
