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

本阶段交付原生节点查询与完整源节点集合。Frostbound 的技能代码仍使用既有位置采样，后续需将查询接入脚本运行时和特效挂点，并解析 15 个内置附件模型的实际依赖。当前验证不等于新挂点路径的战场 GPU、联机或完整游戏验收。
