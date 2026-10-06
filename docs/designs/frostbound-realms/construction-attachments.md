# 原版建造附件

作者：MiYu

`construction-ready` 按宿主 MDX 的完整附件路径解析三种资源：`SharedModels/NEBirth.MDX`、`SharedModels/UBirth.MDX`、`Buildings/Undead/Ziggurat/UBirth.MDX`。两个 UBirth 保持独立源身份。15 种宿主模型使用这些资源，27 个网格部件保留原二进制、蒙皮和材质动画，并追加完整源节点、原始变换轨道和相机朝向标记；粒子与缎带沿用固定查看器的 `.mfx` 采样转换。

游戏客户端由当前宿主 `#pose` 查询附件矩阵和 KATV。可见附件播放对应 Birth 网格与粒子，时间随宿主动画帧推进，继承宿主朝向、比例和节点完整旋转/缩放。节点矩阵的三个基向量参与变换，支持非均匀比例与反射；零比例不绘制。当前源附件矩阵可由 TRS 精确表达；含剪切的新资源会明确拒绝，尚未提供任意 affine 矩阵组件。

显隐预筛选仅跳过源轨道能证明全程不可见的动作；空关键帧窗口使用源默认值 1，Hermite/Bezier 保守保留查询。实际绘制仍使用当帧 KATV 数值。已完成建筑的 Stand 无可见附件时，不加载或采样其附件骨架。外加 buff 不受内置附件显隐影响。

预留附件根与网格子实体，默认全部停用。死亡、取消、迷雾与宿主隐藏会停用根，子节点继承其活动状态。暂停冻结时间和矩阵；联机只使用权威建造进度，存档与重连直接恢复当前相位。当前 `.mfx` 为离散查看器采样，粒子长期连续性、世界空间尾迹、独立全局时钟及外加技能的完整节点旋转/缩放仍需继续完善。

场景共有 21,804 个预留实体。脚本宿主允许首次帧在 3 秒内读取冷快照和初始化，之后各帧保持 1 秒执行时限；预算在首次调用前消耗，失败或重新 eval 不恢复首次预算。超时仍清理未提交命令与运行时请求，后续有效脚本可恢复。25 项脚本测试及独立 Player 编译检查通过；这项初始化预算不代表整体帧时间已达到性能目标。

转换与导入分别验证源码、工具、源资产和生成文件 SHA-256。手工修改的输出在写入前被拒绝，拒绝后其他文件不变。共享 `G:/work/github/MEgine/asset-library` 保持只读，派生集合保存在当前工作树。

```powershell
python scripts/convert-frost-construction.py --metadata-reader tmp/warcraft-effects/attachment-metadata/AttachmentMetadata.dll --sampler <固定 MdxExport.dll 的绝对路径>
python scripts/import-frost-construction.py
node scripts/build-frostbound.mjs
node scripts/test-frost-construction.mjs
python scripts/validate-frost-construction.py --metadata-reader tmp/warcraft-effects/attachment-metadata/AttachmentMetadata.dll --sampler <固定 MdxExport.dll 的绝对路径>
node scripts/qa-frost-effects.mjs --construction
```

客户端验证覆盖 15 宿主、75 个源姿态、59 个可见及 16 个隐藏附件样本；真实建造/取消命令、完整矩阵、反射、暂停、迷雾、存档及权威快照恢复通过。资产验证覆盖三种资源、27 部件、四个视角、324 次原生加载和 27,612 个源顶点，最大误差 `0.0000005052673341943148`。174 个库文件与 166 个导入文件独立重生成一致，覆盖保护检查通过。报告见 [资产验证](construction-asset-validation.json)。

Release 原生编辑器验证通过：单机、完整附件组件及矩阵暂停冻结、两个真实 TCP 客户端和断线重连均通过。固定建造相位的独立源矩阵对照最大误差为 `0.0000004786457061811689`，两端材质管线拒绝数均为 0。原生画面使用稳定的建造相位夹具，真实建造和取消命令由上述客户端测试覆盖。报告见 [原生验收](native-construction-art-qa.json)，画面见 [单机](construction-battlefield.png)、[回城](construction-arrival.png) 和 [联机](construction-network.png)。验收程序 SHA-256 为 `c95eb43852915e85b375eeeb7758df2c08ef4ca0c1777268b374722ad4ce4206`。物理鼠标及音频体验尚未独立验收。
