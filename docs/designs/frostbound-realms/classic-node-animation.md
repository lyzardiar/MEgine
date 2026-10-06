# 原版角色与建筑节点动画

作者：MiYu

Frostbound 已接入的 94 个原版源模型使用原始 MDX 平移、旋转和缩放关键帧求值，包括普通角色、四族建筑、树木、岩石和金矿。32 个模型的 176 个节点保留完整相机朝向或锁 Z 轴标记，小精灵光片、树人叶片、屠宰场链条和兽族建筑绳索按各自视图相机更新。

`asset-library/warcraft-iii/classic-billboard-ready` 是从已校验库生成的动画增强集合：577 个动画网格部件、94 份源节点索引以及工具许可，共 1,252 个生成文件。各 GLB 仅增加 JSON 元数据，原有几何、法线、UV、索引、蒙皮和采样动画二进制缓冲完全保留。源 MDX、原集合 receipt、元数据读取器、固定解析器与生成文件均记录 SHA-256；共享 `G:/work/github/MEgine/asset-library` 保持只读。

节点匹配依据每个 geoset 实际使用的源骨骼索引和祖先顺序，并检查名称、枢轴和父子关系。重复节点名称不影响匹配。导入器校验增强集合及既有输出，导入 114 个基础绑定和工作、拔根等别名，共 131 个经典目录项、4,952 个运行时文件；保留队色、季节材质、材质状态、尸体和建造预览。生成清单按路径排序，独立目录中的重生成字节一致。手工修改过的集合或游戏资源会在写入前被拒绝。

## 原生求值

GLB 根 `extras.mengineMdxAnimation` 保存源动画窗口、全局序列周期和按 glTF 节点索引绑定的原始轨道。值和切线已转为引擎坐标；位置按 1/128 缩放。引擎在动画窗口中选择原始关键帧，支持阶跃、线性、Hermite、Bezier 和四元数球面曲线，处理无关键帧窗口、全局周期和源模型的零缩放语义。源动画时长继续决定循环回绕和非循环终点保持。求值后的父子变换再应用各视图 billboard，保留枢轴与继承缩放。

带此元数据的模型直接读取源轨道；现有 glTF 采样播放接口与无此元数据的模型继续有效。接口支持 1–60 Hz 姿态引用，本次没有改变游戏的 12 Hz 动画更新节奏。全局轨道采用当前姿态引用的动画时间，不具备独立于动画循环的持续游戏时钟。节点 KATV 可见性、动画混合、特效求解器及完整游戏复刻仍需继续完善。

## 验证

- [全部模型的源姿态对照](classic-billboard-pose-validation.json)：94 个模型、577 个部件、四个视角、全部源动画及首帧/中段/终点，73,236 次原生加载、10,122,960 个顶点比较，最大位置误差 `0.000007660351562410739` 引擎单位。包括对象旋转、完整 billboard、锁 Z 和退化俯视方向。
- [30/60 Hz 对照](classic-node-rates-validation.json)：六个代表模型、6,800 次原生加载、740,096 个顶点比较、854 次非循环终点保持，最大位置误差 `0.000003829516601605576`。
- [独立重生成与修改保护](classic-billboard-reproduction.json)：1,253 个集合文件及 4,956 个游戏导入文件逐字节一致，拒绝修改输出时其余文件不变。
- [原生多视图](classic-node-views-validation.json)：小精灵、树人和屠宰场在主视图及六个 rooted UI 头像视图绘制；[预览](classic-node-views.png)。材质拒绝数为 0。
- 资产库 81 项及运行时 216 项测试通过；Release 编辑器、GPU 预览器和姿态探针构建通过。
- [原生单机及双客户端报告](native-classic-node-art-qa.json)覆盖实际 Game View、施法、暂停、回城到达、TCP 双客户端和重连；图像为 Agent 输入与真实渲染，不代表物理鼠标或音频验收。

原生二进制保存在 `tmp/warcraft-effects/classic-node-final-native/mengine-editor-tauri.exe`，已安装编辑器没有替换。日志入口为 `tmp/warcraft-effects/classic-billboard-*`、`classic-node-*`。

## 重生成入口

先按既有资产转换工作流准备固定版本 `4fe46a0772520fc7b55078bf32cda1237d1b5f2e` 的 W3ModelViewer Core。`Wc3Core` 必须指向当前工作树的 `tmp/warcraft-converter/<commit>/upstream/src/Wc3ModelViewer.Core`。

```powershell
dotnet build scripts/warcraft-node-metadata/NodeMetadata.csproj -p:Wc3Core=<Core目录的完整路径> -o tmp/warcraft-effects/node-metadata
python scripts/convert-frost-classic-billboards.py --metadata-reader tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/import-frost-classic.py --pose-probe <新版gltf_bounds.exe完整路径>
python scripts/validate-frost-classic-billboards.py --probe <新版gltf_bounds.exe完整路径>
python scripts/test-frost-classic-billboards.py --metadata-reader tmp/warcraft-effects/node-metadata/NodeMetadata.dll --pose-probe <新版gltf_bounds.exe完整路径>
node scripts/render-frost-classic-billboards.mjs
node scripts/qa-frost-effects.mjs --classic-nodes
```

集合生成器和游戏导入器均支持 `--output`。独立导入需要用当前 `model-catalog.json` 初始化目标目录，以保留其他素材与目录配置。提高采样率的对照工具使用独立输出目录 `tmp/warcraft-effects/classic-node-rates-reference` 构建 `scripts/warcraft-billboard-reference/BillboardReference.csproj` 后运行 `scripts/validate-frost-classic-billboard-rates.py`。

Warcraft III 原始资产仍属于 Blizzard；工具 MIT 许可只适用于转换工具。
