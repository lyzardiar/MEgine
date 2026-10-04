# 资源树倒伏

Author: MiYu

资源树最后一份木材被采集后，从共同树根绕水平轴倒伏，朝向远离最后采集单位的方向。冬季针叶树、森林成熟阔叶树和荒地箭袋树都使用实际三维模型；森林树干、枝条和叶片的三个独立材质网格共用旋转、位置、比例与 LOD。

模拟保存 `felled.frame`、`felled.yaw` 和 `felled.age`。倒伏用时 1.5 秒，落地保留至第 4 秒，随后下沉，在第 6 秒关闭全部材质部分。年龄由固定模拟步长推进，客户端按渲染帧补间，暂停冻结小数进度。获胜后继续完成倒伏，战斗计时不再增加；联机房间保留更新直到未完成的倒伏结束。存档保存实际年龄，重连接收服务器的当前进度。

资源数量、采集间隔、携带与交付、自动换树、已有导航规则和地图格式保持一致。采集耗尽后立即禁止继续采集；倒伏是资源实体的表现状态。单机和公开网络快照均依据玩家当前视野隐藏耗尽及倒伏元数据。存档读取检查树种、耗尽状态、出生帧、方向与年龄范围；旧存档的耗尽资源可继续读取。协议为 32，旧客户端会收到协议不匹配提示。

验证入口：

```powershell
node scripts/build-frostbound.mjs
node scripts/test-frost-tree-felling.mjs
node scripts/test-frostbound.mjs
$env:MENGINE_EDITOR_EXECUTABLE = '<Release 编辑器绝对路径>'
$env:MENGINE_QA_ROOT = '<隔离 QA 目录>'
node scripts/qa-frost-tree-felling.mjs
```

`test-frost-tree-felling-client.mjs` 执行实际客户端，检查每秒 60 次更新中的持续旋转、三个材质部分的共同变换、暂停、小数时间、单机视野和完整关闭。规则测试覆盖三种地貌、四个种族的采木单位、落地方向、根部固定、LOD、后续交付和换树、精确存档续行、旧存档、无效数据与视野过滤。真实 TCP 测试覆盖采集命令、双方相同状态、倒伏途中重连和获胜后的更新。

原生 QA 使用隔离 Release 编辑器和实际 QuickJS 客户端，通过 Agent 键鼠输入采木；检查三种地貌的每部分网格、材质和共同变换、暂停、途中存读档、落地与清除，并检查着色器拒绝数。原生夹具只有两棵资源树，第一棵剩余 5 木材，以便一次采集验证整个生命周期；模型、材质、采集和动画均使用产品代码。报告为 `tree-felling-native-qa.json`，综合交付与安装包校验为 `tree-felling-validation.json`。森林三阶段图片为 `tree-felling-forest-standing.png`、`tree-felling-forest-falling.png`、`tree-felling-forest-fallen.png`。

本阶段完成资源耗尽的刚体式倒伏表现。树干碰撞、树冠与坡面的精确接触、枝条弯折、树桩、风动画仍需扩展。整体游戏与编辑器复刻仍未完成；物理键鼠操作、音频试听、跨机器联机和稳定 Player 帧率尚未验收。当前任务保持禁用 ponytail。
