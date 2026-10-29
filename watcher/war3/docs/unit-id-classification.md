# 单位类型 ID 分类

`IsUnitIdType` 直接读取会话对象表，不创建单位或消耗句柄：英雄直接按传入 rawcode 首字节判断，建筑和飞行／地面读取单位定义，攻击分类读取武器启用位、武器类型和目标，巨型、召唤、亡灵、机械、工人、自爆、城镇大厅、古树和牛头人读取对象分类。分类支持源定义继承和地图 w3u 覆盖；英雄判断无需对象存在，其他分类在未知类型返回 false。

固定版 `Game.dll` 中 `0x6f1e86e0` 的跳表将死亡、眩晕、疾病、诱捕、中毒、变形、睡眠、抗性、虚无和魔免等运行态类别及超出 26 的类别直接返回 false；英雄分支 `0x6f1e8703–0x6f1e871c` 仅检查 rawcode 的最高字节，即使对象不存在亦如此。召唤类型查询 `0x6f1e8851–0x6f1e8872` 读取源 `UnitBalance/type` 中的 `summoned` 分类位，字段和掩码来自 `0x6f6933ca`、`0x6f64f2b2` 及 `0x6f666c4a`。以上是固定 Rizin 对原件的只读静态证据，Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。单位实例 `IsUnitType` 的可变召唤分类初始化规则仍待对照；武器等其他类型分类也未证明完全一致。

阶段验证：运行 `python watcher/war3/tests/generate-research-fixture.py --data-root <data-root>` 后执行 `watcher/war3/build/windows-x86/bin/Release/war3_research_tests.exe <data-root> tmp/docs-artifacts/war3/research/fixture.w3m`。夹具对照原单位实例和 ID 的静态分类，并覆盖自定义单位移动／类别继承、未知 ID、查询不创建实体与运行态分类返回 false、未知大写英雄 ID 和 `summoned` 精确分类。额外覆盖其他地图覆盖、两种武器、类型变形、魔免／抗性等原版行为和真实自定义地图。Win32 Release 客户端与 research 消费者已编译；尚未执行专项或原版对照。
