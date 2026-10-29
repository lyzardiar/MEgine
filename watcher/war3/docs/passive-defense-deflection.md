# 被动防御偏转

AIdd 及其地图派生被动防御能力读取 DataF 的偏转概率和 DataG／DataH 的穿刺／魔法偏转受伤因子，接入现有 Defend 的真实弹道反向与原命中伤害流程。能力可用性、单位物品持有、科技前置、目标资格和全局 DefendDeflection 开关由已有被动及弹道消费者处理；已经反射的弹道不会重复反射。多个主动及被动来源按现有稳定遍历顺序尝试。

来源为固定 Warcraft III 1.27 公共 AbilityData／AbilityMetaData 和 WorldEditStrings，字段说明及摘要见 `tmp/docs-artifacts/war3/faerie-dragon/source.json`。DataC／DataD 的速度字段已连接单位实际移动与攻击，见[被动防御速度](passive-defense-speed.md)；非零 DataI 其他模式仍未实现，会明确报错；原版偏转组合与精确顺序尚未核对。

待集中验证：0／100／中间概率，技能与物品／派生对象及等级覆盖、研究门槛、目标资格／伤害种类、原攻击者和防御者事件、反射对象消失／易主、多个来源与主动 Defend 同时存在、数据异常、随机流及双端同步，核对原版 1.27 弹道与受伤数值。本次仅差异检查，未编译或运行。
