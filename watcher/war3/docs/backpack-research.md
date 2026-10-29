# 四族背包科技

人族 `Aihn`／`Rhpm`、兽族 `Aion`／`Ropm`、亡灵 `Aiun`／`Rupm`、暗夜 `Aien`／`Repm` 由原 AbilityData、能力 Profile 与单位能力表提供。背包容量和物品能力权限遵循 `checkDep`、`Requires` 与 `Requiresamount`；玩家完成对应科技后，已有和新建的单位均按当前归属获得源 `DataA` 两个物品槽。无前置的 `AInv` 继续使用其自身槽数。地图自定义能力沿用源覆盖；已解析的前置按能力及等级缓存，升级查询直接读取所属玩家等级。

易主或前置失效时现有六槽物品保留，JASS 仍可查询和移除；源 `DataB` 死亡掉落规则继续应用。移除背包能力后、易主与前置失效时原版如何显示或处置已持物品仍需对照。建筑类前置目前需扫描所属单位，密集自定义地图的成本尚需验证。最多解析 64 条前置，避免异常数据造成无界工作。

原 1.27 `Units/UnitAbilities.slk` 分别为 hfoo、ogru、ugho、earc 配置以上能力；`AbilityData.slk` 的基础能力为 AInv，`checkDep=1`，两格背包以 `DataA1=2` 配置；原能力 Profile 提供对应科技前置。四族能力的 DataB 为 1、DataC 为 0，通用英雄物品栏的对应值为 0、1。

新增 `tests/research_tests.cpp` 消费者检查四族单位的前后置、拾取、易主保留及死亡掉落，并检查无前置六槽能力；Win32 Release 客户端及 research 消费者已编译；专项运行、原版对照与窗口交互留待阶段验证。
