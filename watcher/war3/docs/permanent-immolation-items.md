# 常驻献祭与火焰风衣

原版常驻献祭 `ANpi` 和物品献祭 `AIcf` 使用已有 `Apig` 常驻范围伤害消费者。单位拥有能力、获得或丢弃物品、能力增删及英雄死亡／复活通过现有能力与库存刷新登记或移除定时脉冲和原资源状态；伤害作用于源 `targs` 允许的附近单位，并进入真实伤害、死亡与事件处理。`AIcf` 被识别为物品被动，不能再作为主动技能使用；`clfm` 和 `shdt` 通过源物品能力列表获得效果。

本机 1.27 资源 `Units/AbilityData.slk` 中，`AIcf` 为 160 范围、每秒 10 点、目标 `ground,enemy,neutral`、Buff `BIcf`；`ANpi` 为 220 范围、每秒 10 点、目标额外限制 `organic`、Buff `BNpi`。`ninf` 持有 `ANpi`，`clfm` 和 `shdt` 含 `AIcf`。地图 `w3a` 能力覆盖按同一 `code` 与级别读取自己的范围、间隔、伤害、目标和 Buff。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；REA 的 `ev_7fdc0c5d15a8a2b5e19195d138f862af3e3c19fd58b38380cb72b6f590746844` 显示 `0x6f628eb0` 注册 `AIcf`，`0x6f629250` 注册 `Apig`，两者均返回 `ANpi` 原型；`0x6f6292b0` 注册 `ANpi`。客户端不加载该 DLL。

Win32 x86 MSVC 对实现和新增测试源的语法检查通过。相同能力 ID 的多件物品目前合并为一份被动；叠加、禁用、暂停、变形、传送／装载、目标边界、免疫、实际物品／单位画面、周期伤害与伤害事件时序均需与 1.27 原版集中对照。`tests/control_tests.cpp` 新增 `ambient-immolation` 待执行模式，覆盖拾取、范围伤害、丢弃、能力添加及移除清理；原图、多人同步及性能不由该检查证明。
