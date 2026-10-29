# 玩家对局分数

`GetPlayerScore` 的 `PLAYER_SCORE_RESOURCE_TOTAL`（23）读取实际采集统计：维护费后的采金量加木材总采集量，使用 32 位整数相加。空／无效玩家及不在 0–24 范围内的类别返回 0。

基准为 Warcraft III 1.27.0.52240 的 Game.dll，SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 证据 `ev_b9d82f9230c3554ff3fadaa85c9a188dce99fc6d8af4d31aa58e472107ece823` 观察到入口 `0x6f1e3d90` 对空玩家及类别大于等于 25 返回零，类别 23 跳至 `0x6f1e3f36`；`ev_334748f355281d1ca3d1641d54e22e3a276d830c636650d8ee4fe4cec0ff4d84` 观察到其调用 `0x6f24c0d0`，相加 `0x6f248760` 与 `0x6f24a440`，对应类别 11 和 16。原版维护费计数有十分之一单位的内部精度，当前客户端仍按整数采集结算累计，资源上限、不同收入来源及数值精度需要对照。

阶段运行 `python watcher/war3/tests/generate-harvest-fixture.py --data-root <data-root>`，再运行 `watcher/war3/build/windows-x86/bin/Release/war3_harvest_tests.exe <data-root> <生成地图>`；新增检查经真实资源返还入口记录采金与携带木材，验证资源总分、空玩家和越界类别。另需核对维护费、溢出、双方玩家隔离与原版结算界面。专项及原版运行对照尚未执行。


`PLAYER_SCORE_UNITS_TOTAL`（21）按类型累计已完成训练、建筑施工以及敌方击杀／摧毁数量，查询时用源 `UnitBalance` 的金币与木材价格乘以该类型总数后求和。`PLAYER_SCORE_HEROES_TOTAL`（22）汇总玩家当前非幻象、未移除英雄的经验，包括死亡但未移除的英雄；`PLAYER_SCORE_TOTAL`（24）为单位、英雄、资源分数的 32 位加和。建筑／训练／击杀计数沿用现有的实际回调，归属转换按当前英雄所属玩家查询；单位类型及计数独立于之后的单位易主、删除与重生。

原版 `GetPlayerScore` 的跳表证据 `ev_14b42aaa8617b4784511b66602e2c34d3b64bd3bd098e8d346f5af61191d7991` 与 `ev_6c53c5d0c882c1ef5f2b436f61ad1bfebe0ce197cb7965e8b9a7fabce1fdf294` 对应三个类别；`ev_5d0031e6f5eb2e50266861cad160cf4e068982961609f46e2dde3f7ab1223225` 显示 21 按类型计算 `(生产计数+击杀计数)×(金币成本+木材成本)`，两种成本函数与原版 `GetUnitGoldCost`／`GetUnitWoodCost` 的注册和调用关系见 `ev_e0786bae99c6ab298b3e100aa95ce972e9ee7b5009c83377178d1821eafc2a5b`、`ev_afac9cc5da6889bbd62e336a38879418828660f459cd75921c86d994d3657de5`、`ev_860e3632b744f7d9b2bbe4fa09d90d697b30c23f0523d892993b2cad1a37d1c3`。`ev_eb2d5472e9c0a378432592f4d6d2499406729eff91c0122b520fc01c8996b890` 与 `ev_0c70e567f869b177d15377724437da5be906f64abe0af74c260ed8adca4d6f03` 表明 22 汇总英雄经验；`ev_1b84bd5b3cb53d8f7b8e48624c84883cfe065f69f0c4294724497524754fdad7` 显示 24 相加三个分项。

Win32 Release 客户端及 commerce 消费者已编译；新增 `tests/commerce_tests.cpp` 检查训练价值、英雄易主和经验以及三项加总，尚未执行，留待批次。已知原版对初始单位、脚本创建、召唤／幻象、免费建筑、英雄复活、移除／缓存及单位类型转换的计数和时序尚未证实；现实现仅覆盖已有训练、施工、击杀回调。需用原版对照这些路径、地图对象价格覆盖、零／负价格、32 位溢出、网络同步与结算界面。

`PLAYER_SCORE_TECH_PERCENT`（4）读取玩家种族，在原版及地图对象升级中筛选同种族、`used` 非零且符合当前版本的有效科技，累计最大等级作为分母；分子累计当前玩家这些科技的已研究等级。分母为零返回 100，否则计算等级比例乘 100 并向零截断。自定义升级继承其源对象与地图覆盖；本实现查询种族时沿用现有 `playerRace` 的懒解析。

固定版原件 `0x6f22d610` 的遍历与比例运算见 `ev_64c582c2f70b821e0f263bfb7de86792a0722a026d7b86a40000015d97aedf9f`、`ev_289ee8697f6ac0580e5e11b0d1fea2f1e0f59ac4712dfb0f755be4a1d5d81d50`、`ev_9f29cc4a272a02b5432ce224b42b8b18752070a229200ab85ce874a3fb2f98ba`；升级对象加载 `maxlevel`／`used` 及分母读取见 `ev_691e1551e356c83936fcc1c9e9e5447e5a003547cd77990040e6f99d1fcfdf1c`、`ev_fa13b8b3e5ec809cab367e18b1fbd854c787596c00120841c297bfb885191431`、`ev_0430b0fd6245d41c5d2f484c9ffde1b2efce16601684daaa261af1247821da96`。种族字符串映射见 `ev_0f6c7a1b1ceff29dec68436b25880d3185fbdf65ec2f7ec494548f79d11be465`。

原件按 `version` 和当前版本模式过滤科技（`ev_dda7c898d695bcec7057aaeade849b848319b6579f1ac389e5bdf5a903ad9301`、`ev_d7c2bf473538f0e7978a999d7d69fc9e860ec3a1999795b4da501c3f6395d1d0`），矩阵 `ev_b984c1fafdd313e6fcbb32654eb526df0f4644d51dac60cf6764c77623b55456` 显示 ROC 模式接受 version 0、TFT 模式接受 0 和 1；本实现按现有 `VersionGet` 状态应用该筛选。当前会话的 `version_` 固定为 TFT，ROC 会话模式仍需完善。分子节点的完整资格、其他有效性过滤、自定义科技覆盖、随机种族解析与浮点精度仍需对照；Win32 Release 客户端与 research 消费者已编译；`tests/research_tests.cpp` 增加人族研究提高百分比的消费者检查，尚未执行。
