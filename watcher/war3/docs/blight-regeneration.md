# 荒芜地形与持续恢复

2026-10-27。地图查询、运行中荒芜修改、渲染失效和单位恢复使用同一份会话World。原MPQ和地图只读，修改保留在内存中。

## 状态与消费

- IsPointBlighted读取32单位路径网格的0x20位；有WPM时保留原图初始值，无WPM时从地形顶点建立仅供荒芜查询的有界网格。SetBlight、SetBlightLoc、SetBlightRect和SetBlightPoint修改路径位和地形顶点荒芜位，校验玩家及有限坐标/范围。
- GetTerrainType返回源W3E地表类型的JASS四字符ID，GetTerrainVariance返回地表变体。当前按最近128单位顶点读取；边界/舍入和特殊地形仍待原件精确对照，SetTerrainType及其他路径修改接口继续实现。
- 每个16×16格区域维护荒芜版本。重复写入相同状态不触发新失效；顶点变化覆盖相邻区域。地表底层和荒芜层使用源贴图/混合掩码，初始荒芜网格参与实际载入上传进度。
- 运行中只重建可见脏区域，每帧最多4块，并在块间检查3ms预算。区域外观更新不重编译静态悬崖、地表合成图、水面或全部地图资源；隐藏区域留到可见时处理。新GPU路径尚未实测，不表示帧耗时已达标。
- 固定模拟步使用UnitBalance的regenHP/regenMana/regenType，读取当前昼夜和荒芜状态。支持always/day/night/blight/none，英雄力量/智力增量来自MiscGame。当前暂停单位停止恢复；恢复或负恢复连接实际生命、魔法及死亡状态，单位删除回调使用句柄快照。
- MSVC核心/客户端启用/MP8；生成项目确认MultiProcessorCompilation=true、ProcessorNumber=8。该设置用于后续必要编译，不代表运行时性能结论。

## 原件依据

REA 6.5.0和固定Rizin仅静态读取摘要已核对的Game.dll。IsPointBlighted注册至0x6f1e8250，向路径查询0x6f030e80传入0x20；SetBlightPoint注册至0x6f1f3fe0，调用0x6f472320，后者向路径修改入口0x6f0304f0传入0x20。玩家归属标记、原版绘制/路径精确边界、范围量化和修改顺序仍待对照。

原始证据为 `tmp/docs-artifacts/war3/blight-*-rea.json`、`terrain-query-identity-rea.json`。DotA源数据有66,320个WPM荒芜格、4,164个W3E荒芜顶点、9种地表；底层地表索引均在源表范围内。源统计不替代运行验收。

## 开发检查与阶段队列

必要Win32 Release产品/扩展消费者编译无警告；7个字面量native声明和夹具生成器语法检查通过。DotA原globals/config/main及250ms、2,000ms模拟均退出0，bj_gameStarted=true，无Game.dll；这些是开局阻塞检查，未验证完整对战或可玩性。

商店消费者夹具已检查荒芜清除／添加／查询、幂等失效、侍僧恢复及清除后停止恢复。夹具关闭侍僧自动寻敌以保持位置，Win32 Release 定向检查通过；自然追击导致进出荒芜地及原版恢复时序仍待核对。原版范围/边界/玩家归属、缺失WPM、昼夜/英雄/负恢复及暂停策略、真实图层/上传/切图释放、可见区域调度和性能仍待集中验证。CreateBlightedGoldmine、完整矿工/建造规则、地形/路径修改和全部对战尚未完成。

产物：`tmp/docs-artifacts/war3/blight-{build,dota,dota-2000ms}.log`。当前会话1为Disconnected；本轮没有执行GPU、专项夹具、三图完整回归或性能基准。旧MEngine延期批次保持原状态，旧地图解包缓存仍等待完整直接加载验收后再清理。
