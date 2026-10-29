# 单位类型 ID 分类

`IsUnitIdType` 直接读取会话对象表，不创建单位或消耗句柄：英雄按源类型继承根判断，建筑和飞行／地面读取单位定义，攻击分类读取武器启用位、武器类型和目标，巨型、亡灵、机械、工人、自爆、城镇大厅、古树和牛头人读取对象分类。查询继承和地图 w3u 覆盖，未知类型返回 false。

死亡、召唤、眩晕、疾病、诱捕、中毒、变形、睡眠、抗性、虚无、魔免及未知分类当前明确报告不支持，避免用假值代替行为。这里的英雄继承和武器分类遵循现有客户端规则，未证明与 Warcraft III 1.27 完全一致；原版对运行态类别、无效 ID 和自定义英雄的实际语义仍待核对。

阶段验证：运行 `python watcher/war3/tests/generate-research-fixture.py --data-root <data-root>` 后执行 `watcher/war3/build/windows-x86/bin/Release/war3_research_tests.exe <data-root> tmp/docs-artifacts/war3/research/fixture.w3m`。夹具对照原单位实例和 ID 的静态分类，并覆盖自定义单位移动／类别继承、未知 ID、查询不创建实体与运行态分类明确失败。额外覆盖其他地图覆盖、两种武器、类型变形、魔免／抗性等原版行为和真实自定义地图。尚未执行专项或原版对照。
