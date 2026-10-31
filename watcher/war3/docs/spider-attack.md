# 穴居恶魔蜘蛛攻击表现

远程攻击携带启用的 `Aspa` 时，从对象数据读取普通单位与英雄持续时间；命中并对存活单位造成伤害后，使用原资源 `Abilities\Weapons\CryptFiendMissile\CryptFiendMissileTarget.mdl` 附着目标，到期后将 `CryptFiendMissile.mdl` 作为独立的无伤害视觉弹道飞回攻击者。其他生效的武器法球、箭矢或闪电效果覆盖该表现。效果和视觉弹道不分配 JASS 句柄，也不占用真实伤害弹道额度；目标死亡或移除时结束附着，资源清理沿用效果生命周期。

原安装的 `war3.mpq` 提供两项模型；`Game.dll`（SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`）静态分析识别了 `CAbilitySpiderAttack`、`CMissileSpiderAttack`、`CBuffSpiderAttack`，证据标识 `ev_67fa3eea7abeb6602134c0d296672c8ed60ad7e72e305927f4bbf36ab01fde52`，不表示时序已经对照。回程速度 500、弧度 0.15 和目标 origin 附着点为当前实现参数。

Win32 Release 构建通过；`war3_passive_tests.exe <data-root> <fixture.w3m> spider-attack` 通过 1/1，覆盖命中、持续、无伤害回程、禁用、目标死亡和火焰之球覆盖；`line-weapon` 通过 4/4。游戏内 Agent 在隔离地图获取了实际攻击帧，步兵生命下降且附近出现蜘蛛模型，证据位于 `tmp/docs-artifacts/war3/spider-attack/agent-second-check/`。

阶段核对 1.27 原版的附着点、模型朝向、回程速度／轨迹、持续时间、多个蜘蛛叠加、攻击者死亡、伤害为零或致死以及物品／可破坏物目标；验证资源释放、长局性能、多人同步和真实地图。当前画面和专项检查不代表原版精度验收。

回程使用发射时记录的武器发射偏移与高度，追踪攻击者移动及朝向；不将追踪目标当作受击目标读取 impact 高度。新增定向检查在回程途中改变攻击者位置和朝向，验证目标坐标及发射高度。实际挂点与移动中原版轨迹仍待对照。
