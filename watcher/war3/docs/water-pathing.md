# 水面与两栖单位路径

单位移动类型读取原 UnitData `movetp` 和地图对象覆盖 `umvt`：`foot` 等陆地类型使用 WPM 的 unwalkable 位 2，`fly` 使用 unflyable 位 4，`float` 使用 unfloatable 位 64，`amph`／`hover` 使用 unamphibious 位 128。陆地、水面与两栖单位共享现有地面动态阻挡，飞行单位使用现有飞行动态阻挡。路径搜索仍采用既有净空、对角约束和有限 A*。

实际单位的移动、追击和重算，以及训练／购买生成、召唤、变形、传送、闪烁、运输卸载及骑乘结果的落点查找均按对应类型选择地图路径位；已有布尔调用保留陆地／飞行语义。原 UnitData 摘录包括 `nbot` 的 `float` 与 `nzep` 的 `fly`，源摘要 SHA-256 `34a0c8083f146b5d3e25d92a19a8822151d4b26dfe9c1c325a6229466d1b04d6`，原始摘要见 `tmp/docs-artifacts/war3/transport/source.json`。路径位名称与数值沿用现有源建筑放置规则。

水陆边界、hover 和 amphibious 精确语义、动态障碍物、地图覆盖、船厂／海军实际生成及战役海岛地图尚待集中验证；水面高度、船只专属碰撞和完整原版路径行为仍需实现或对照。
