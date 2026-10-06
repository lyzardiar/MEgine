# 原版模型节点的相机朝向

作者：MiYu

嗜血、闪电护盾和回城的 7 个已接入技能资源，现在保留动画网格中的 26 处 MDX billboard 标记。转换输出位于 `asset-library/warcraft-iii/billboard-ready`，其中 213 个文件记录源 MDX、原几何集合清单、转换器及生成文件哈希。原始蒙皮、动画、UV 和索引二进制缓冲未改变，原许可随集合保存。共享 `G:/work/github/MEgine/asset-library` 保持只读。

`convert-warcraft-assets.py` 在动画节点的 `extras.mengineBillboard.flags` 中保留源标记。当前补充集合从已经校验的几何文件和源 MDX 添加相同元数据，不重新采样或改写二进制动画。样例导入器记录几何集合及清单哈希，复制带标记的动画网格。

原生 `GltfPoseSource` 在动画取样后处理节点层级：保持节点枢轴的位置及继承缩放，以当前相机替换 billboard 节点的旋转，再让子节点组合到新的父变换。源 +X 面向相机、+Z 向上，转换后对应引擎 +X 面向相机、+Y 向上。引擎识别完整 billboard 与源 X/Y/Z 锁轴；完整 billboard 优先，符合固定源查看器的行为。当前 7 个源模型实际使用完整 billboard；锁轴的数学行为已测，其他源模型和原版游戏的锁轴表现尚待逐项验收。相机退化或对象缩放不可逆时保持可用的动画姿态。

共享 `RuntimeMeshCache.sync_frame` 在战场、编辑器和每个 live UI view 中分别取样，使用相机方向、对象旋转/缩放和动画帧作为 GPU 网格缓存上下文。相同姿态的平移对象复用缓存；不同相机和朝向使用独立网格。文件更新使所有相机变体失效；非当前帧的旧采样按现有 256 项清理阈值回收。资源诊断显示原始资产引用，原生性能采样增加 `billboardMeshes` 数量字段。

## 验证

- `billboard-pose-validation.json`：4 个视角、21 段源动画与循环边界/非循环终点，757 次原生加载；独立源 MDX 查看器对照 26,496 个顶点，最大位置误差 `0.0001785169242858875` 引擎单位，低于既有 `0.5/128` 阈值。另验证不均匀对象缩放后的卡片平面仍朝向相机。二进制缓冲保持一致。
- `billboard-views-validation.json`：共享原生 Game View GPU 渲染器在一张图中绘制同一原版卡片的主视图及两个 rooted live UI view；三种相机上下文对应三个 GPU 网格，材质管线拒绝数为 0。画面为 `classic-billboard-views.png`。
- `billboard-reproduction.json`：214 个集合文件独立重生成字节一致；修改输出后拒绝生成，拒绝前后所有输出字节不变。
- `test-frost-effects-import.py`：样例 184 个输出独立重生成字节一致，修改保护通过。
- `gltf_pose` 4 项检查及 `meshes` 8 项检查通过，覆盖旋转、枢轴、缩放、锁轴、退化视角、相机隔离、资源更新和已有网格路径。完整资产库 76 项、运行时库 216 项回归通过；独立播放器入口编译检查通过。
- `native-billboard-art-qa.json`：生产协议 Tauri 编辑器实际施法、暂停、8 个回城到达效果、真实 TCP 双客户端和断线重连通过；主机和客机分别有 4、2 个活动相机网格，两端材质管线拒绝为 0，日志没有模型或贴图加载失败。画面使用 `classic-billboard-*` 前缀。

## 重生成与复验

```powershell
python scripts/convert-frost-billboards.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
python scripts/import-frost-effects.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
node scripts/build-frostbound.mjs
dotnet build scripts/warcraft-billboard-reference/BillboardReference.csproj -c Release -o tmp/warcraft-effects/billboard-reference -p:Wc3Core=<固定查看器的 Wc3ModelViewer.Core 完整路径>
python scripts/validate-frost-billboards.py
python scripts/test-frost-billboards.py --sampler tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/bin/MdxExport.dll
node scripts/render-frost-billboards.mjs
$env:MENGINE_EDITOR_EXECUTABLE='<本阶段生产协议编辑器 exe 的完整路径>'
node scripts/qa-frost-effects.mjs --billboard-art
```

原生探针、预览器和 Tauri 需使用包含本阶段引擎修改的构建。已安装的编辑器没有替换。当前验收覆盖这 7 个技能模型；其他模型仍需补充节点元数据和验证。状态 KATV 可见性、取消/到期的 Death 过渡及离散粒子求解精度缺口仍未补齐，完整 Warcraft III 游戏、物理鼠标与音频尚未验收完成。
