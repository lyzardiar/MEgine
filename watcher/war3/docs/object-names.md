# 游戏对象名称查询

`GetObjectName` 读取对象覆盖与源 Profile 的 Name 字段首项，支持不具有单位／物品／能力／科技定义记录但有 Profile 名称的 ID；缺少名称时返回 `Default string`，显式空名称返回 JASS 字符串 null。原始 Profile 名称独立保留引号，按引号外逗号取首项；地图对象名称覆盖按等级分别处理，首级覆盖原样保留逗号，未覆盖首级时沿基础对象继承。通用 Profile 字段读取和其他界面消费者沿用原有格式。已有可破坏物名称读取保留。对象 Profile 依 1.27 的 46 项来源顺序加载，补入 UnitGlobalStrings、CommandStrings、CommandFunc 和 Telemetry；地图资源继续优先于公共归档。

固定对照 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 证据 `ev_acf067f24b22051193b88289e3020ac99c92b0b7c34e4e3db180cff6da6d306d` 为 46 项 Profile 加载顺序，`ev_38f2661a9f0138d87d6211d5e41bc0b638da0473cc3f6340bcba225d19920a9f` 为五类地图对象元数据名称查询，`ev_e448ad8fe97675034021c59ce637f65e3a086d7f7e36512b2e21bbb55d43cfbd` 为缺少名称时的默认字面量和空名称返回路径。

阶段执行 research 夹具与消费者，验证仅存在 Profile 的 ID、空名称、缺失 ID、原始多名称、引号内逗号、地图覆盖、未覆盖首级的继承及 DotA 实际调用。原版单项引号与转义、空 Name 的存储方式、源表冲突优先级和可破坏物名称行为仍须与原版运行对照。尚未完成真实地图验收。
