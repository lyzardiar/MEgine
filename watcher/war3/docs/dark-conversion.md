# 黑暗转换

`ANdc`／`SNdc` 读取源能力目标类别、目标种族、转换单位、施法时间、持续时间和 Buff。单位目标按源种族与控制技能目标规则筛选；施法完成后目标进入睡眠和禁令状态，持续到期时走单位死亡／移除流程，并在原位置创建施法者所属的源类型单位。地图能力与单位对象覆盖沿现有对象数据读取。`SNdc` 的源原型为 `ANdc`，使用同一消费者。

资源依据为本机 Warcraft III 1.27.0.52240 的 `Units/AbilityData.slk`（SHA-256 `ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec`）与 `Units/NeutralAbilityStrings.txt`。原版数据为目标 `commoner`，转换为 `nzom`，Buff `BNdc`，持续 6 秒；`ANdc`／`SNdc` 的 Cast 分别为 5／0 秒。原始摘录位于 `tmp/docs-artifacts/war3/control-ownership/source.json`。

待阶段验证：分别执行 `tests/generate-control-fixture.py --data-root <data-root>` 及 `war3_control_tests <data-root> <fixture> conversion`；核对普通／快速施法、可中断性、村民及自定义种族和转换类型、Buff 驱散／唤醒／伤害、死亡事件与尸体、僵尸所属玩家及死亡后创建时序、选择／人口／技能、视觉音效和多人同步。死亡与转换采用现有生命周期，原版具体时序与效果尚未核实；`Asou` 是独立的灵魂物品能力，尚未接入。
