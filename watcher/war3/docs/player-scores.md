# 玩家对局分数

`GetPlayerScore` 的 `PLAYER_SCORE_RESOURCE_TOTAL`（23）读取实际采集统计：维护费后的采金量加木材总采集量，使用 32 位整数相加。空／无效玩家及不在 0–24 范围内的类别返回 0；科技百分比仍明确报告不支持。

基准为 Warcraft III 1.27.0.52240 的 Game.dll，SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 证据 `ev_b9d82f9230c3554ff3fadaa85c9a188dce99fc6d8af4d31aa58e472107ece823` 观察到入口 `0x6f1e3d90` 对空玩家及类别大于等于 25 返回零，类别 23 跳至 `0x6f1e3f36`；`ev_334748f355281d1ca3d1641d54e22e3a276d830c636650d8ee4fe4cec0ff4d84` 观察到其调用 `0x6f24c0d0`，相加 `0x6f248760` 与 `0x6f24a440`，对应类别 11 和 16。原版维护费计数有十分之一单位的内部精度，当前客户端仍按整数采集结算累计，资源上限、不同收入来源及数值精度需要对照。

阶段运行 `python watcher/war3/tests/generate-harvest-fixture.py --data-root <data-root>`，再运行 `watcher/war3/build/windows-x86/bin/Release/war3_harvest_tests.exe <data-root> <生成地图>`；新增检查经真实资源返还入口记录采金与携带木材，验证资源总分、空玩家和越界类别。另需核对维护费、溢出、双方玩家隔离与原版结算界面。专项及原版运行对照尚未执行。


`PLAYER_SCORE_UNITS_TOTAL`（21）按类型累计已完成训练、建筑施工以及敌方击杀／摧毁数量，查询时用源 `UnitBalance` 的金币与木材价格乘以该类型总数后求和。`PLAYER_SCORE_HEROES_TOTAL`（22）汇总玩家当前非幻象、未移除英雄的经验，包括死亡但未移除的英雄；`PLAYER_SCORE_TOTAL`（24）为单位、英雄、资源分数的 32 位加和。建筑／训练／击杀计数沿用现有的实际回调，归属转换按当前英雄所属玩家查询；单位类型及计数独立于之后的单位易主、删除与重生。

原版 `GetPlayerScore` 的跳表证据 `ev_14b42aaa8617b4784511b66602e2c34d3b64bd3bd098e8d346f5af61191d7991` 与 `ev_6c53c5d0c882c1ef5f2b436f61ad1bfebe0ce197cb7965e8b9a7fabce1fdf294` 对应三个类别；`ev_5d0031e6f5eb2e50266861cad160cf4e068982961609f46e2dde3f7ab1223225` 显示 21 按类型计算 `(生产计数+击杀计数)×(金币成本+木材成本)`，两种成本函数与原版 `GetUnitGoldCost`／`GetUnitWoodCost` 的注册和调用关系见 `ev_e0786bae99c6ab298b3e100aa95ce972e9ee7b5009c83377178d1821eafc2a5b`、`ev_afac9cc5da6889bbd62e336a38879418828660f459cd75921c86d994d3657de5`、`ev_860e3632b744f7d9b2bbe4fa09d90d697b30c23f0523d892993b2cad1a37d1c3`。`ev_eb2d5472e9c0a378432592f4d6d2499406729eff91c0122b520fc01c8996b890` 与 `ev_0c70e567f869b177d15377724437da5be906f64abe0af74c260ed8adca4d6f03` 表明 22 汇总英雄经验；`ev_1b84bd5b3cb53d8f7b8e48624c84883cfe065f69f0c4294724497524754fdad7` 显示 24 相加三个分项。

Win32 Release 客户端及 commerce 消费者已编译；新增 `tests/commerce_tests.cpp` 检查训练价值、英雄易主和经验以及三项加总，尚未执行，留待批次。已知原版对初始单位、脚本创建、召唤／幻象、免费建筑、英雄复活、移除／缓存及单位类型转换的计数和时序尚未证实；现实现仅覆盖已有训练、施工、击杀回调。需用原版对照这些路径、地图对象价格覆盖、零／负价格、32 位溢出、网络同步与结算界面。
