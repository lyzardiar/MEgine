# 玩家资源总分

`GetPlayerScore` 的 `PLAYER_SCORE_RESOURCE_TOTAL`（23）读取实际采集统计：维护费后的采金量加木材总采集量，使用 32 位整数相加。空／无效玩家及不在 0–24 范围内的类别返回 0；已知但未实现的科技、单位、英雄和总分仍明确报告不支持。

基准为 Warcraft III 1.27.0.52240 的 Game.dll，SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 证据 `ev_b9d82f9230c3554ff3fadaa85c9a188dce99fc6d8af4d31aa58e472107ece823` 观察到入口 `0x6f1e3d90` 对空玩家及类别大于等于 25 返回零，类别 23 跳至 `0x6f1e3f36`；`ev_334748f355281d1ca3d1641d54e22e3a276d830c636650d8ee4fe4cec0ff4d84` 观察到其调用 `0x6f24c0d0`，相加 `0x6f248760` 与 `0x6f24a440`，对应类别 11 和 16。原版维护费计数有十分之一单位的内部精度，当前客户端仍按整数采集结算累计，资源上限、不同收入来源及数值精度需要对照。

阶段运行 `python watcher/war3/tests/generate-harvest-fixture.py --data-root <data-root>`，再运行 `watcher/war3/build/windows-x86/bin/Release/war3_harvest_tests.exe <data-root> <生成地图>`；新增检查经真实资源返还入口记录采金与携带木材，验证资源总分、空玩家和越界类别。另需核对维护费、溢出、双方玩家隔离与原版结算界面。专项及原版运行对照尚未执行。
