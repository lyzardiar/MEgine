# 保存权杖

原版奇迹古树出售的 `spre` 使用 `ANpr`，目标射程 700，冷却 30 秒，不消耗次数。客户端将目标单位传送至其所属玩家的主基地附近；复用物品施法、事件、路径占位及地图视野更新。目标或基地失效时停止传送。

原版 `CAbilityPreservation` 虚表为 `0x6fa491d8`，释放入口 `0x6f613030` 把 DataA 低四位传给 `0x6f626540`，按目标所有者筛选目的地并传送目标；目标校验也检查目的地。筛选回调 `0x6f6265a0` 按候选分类与类型数值选择。DataA 的原版默认值为 15。静态证据为 `ev_52d9392bbbfe983e156f2124b5c9d0c17cfbeb90c51352ef9bfb5dd21e8e9bf5`、`ev_e1dc4dc4a18c1ddc7a7a2515af09cdacabe2bb62fd02a2938be18c988d5d8726`、`ev_a0e8bf0d03fc47f179ec7413f24f4d90f0746ce848cb184723dd35f5abc5cecc`。原资源来自 `War3Patch.mpq` 的 ItemData、AbilityData、NightElfUnitFunc 和 ItemStrings。

原版候选的排序字段从 `UnitData` 的 `prio` 读取：`0x6f6931b4` 注册字段，`0x6f6964e0` 读取，`0x6f64f936` 保存到类型对象 `+0x1cc`；选择函数转成整数后比较，同分类使用较大优先级。原四族一级、二级和三级主基地的优先级分别为 6、7 和 8。静态证据为 `ev_fdb887df2e710c8b1921f0d8e56a16bd7a3e13be1930f631082975b64008bd24`、`ev_a607dde45fa29c9ba81c503249097f77c6fd63be49503815eac452d4f0ef839f`、`ev_c8ede1ae33503230e7771001294cb8e1f70dbb2aef7888ab90787c09cb80195b`。客户端现按该字段比较。

落点使用现有路径占位搜索；混合种族和同级选择、无基地或失效目标的事件／消耗时机，以及传送视觉和落点仍待对照。Win32 Release 客户端编译通过；原版对照、自定义覆盖及真实窗口操作留待功能批次验证。
