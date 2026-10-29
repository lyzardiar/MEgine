# 默认自动施法与变形

单位创建时读取源 `UnitAbilities.auto`，优先使用能力列表中的同一 ID；若该字段指向能力原型而列表中只有一个对应派生能力，则使用该实例能力的自动施法开关。不能唯一确定的对应关系保持未启用。技能仍经现有科技、目标、魔法、冷却和能力开关检查。

变形时保留相同能力 ID 的开关；如果旧能力被新形态中的唯一同原型能力替换，则传递原开关状态。没有唯一替换的能力使用新形态的默认设置；已移除的能力不会因为默认列表重新加入自动施法状态。原版开关继承、重入、脚本添加／移除、多人同步与多衍生能力组合待阶段对照。

原安装源表中 `edtm` 默认自动施法为 `Afae`，能力列表为 `Afa2`，后者 `AbilityData.code=Afae` 且前置 `Reec`。其他来源表含 `nnwl` 的 `Aweb/ACwb` 和 `nhhr` 的 `Arai/ACrd`。本地表资料保留在 `tmp/docs-artifacts/war3/unit-forms/source.json`、`tmp/docs-artifacts/war3/unit-casters/source.json`；实际自动施法覆盖仍取决于现有对应技能消费者。
