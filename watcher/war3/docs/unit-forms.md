# 熊形态、风暴之鸦与恶魔变身

2026-10-28。Abrf、Arav、AEme已接入独立客户端的真实单位类型转换。完整客户端与原版一致性仍未验收。

娜迦 `Asb1`／`Asb2`／`Asb3` 的源原型为 `ANsu`，分别转换 nmyr↔nmys、nnrg↔nnrs 和 nsnp↔nsbs。`submerge`／`unsubmerge` 使用源持续时间、技能前置与按钮；潜水形态按源单位配置关闭武器和移动，并接入潜藏检测、模型动画及原句柄恢复。直接创建潜水形态也能浮出。当前尚未限定地形水域；地形限制、显隐／侦测类别、AI、转换时序与原版画面仍待对照。

| 能力 | 源类型 | 实际消费 |
| --- | --- | --- |
| 熊形态 | edoc ↔ edcm | bearform/unbearform、25魔法、1.45秒形态转换、普通单位生命比例、源模型/护甲/武器/能力/恢复、免费返回 |
| 风暴之鸦 | edot ↔ edtm | ravenform/unravenform、50魔法、0.6秒形态转换、即时起飞标志、1秒高度调整/着陆延迟、240高度、飞行/地面目标与350速度 |
| 恶魔变身 | Edem → Edmm → Edem | metamorphosis、150魔法/180秒冷却、1.5秒形态转换、60秒有效形态、500额外生命、源远程混乱攻击、自然返回和死亡后普通英雄 |

施法前摇沿用源单位castpt；表中转换时长属于释放后的形态阶段。转换保留同一UnitState与句柄、owner、物品、用户数据、英雄等级/经验/属性/技能点，以及非模板或永久能力。类型、武器查询、科技、移动类型、恢复、碰撞、人口和模型/图标更新到新类型。普通单位保持当前生命比例；英雄不重新初始化成长，额外生命在返回时扣回，活单位至少保留1生命。

源Animprops的alternate/alternateex进入普通、行走、攻击、死亡和附件动画选择。转换使用Morph/Morph Alternate；UI读取Unart/Untip/Unubertip/Unhotkey/Unbuttonpos，恶魔形态保持原技能图标并禁止重复开始。

飞行落地检查地图路径及其他单位碰撞，MorphLandClosest启用时在当前位置周围有界搜索；实际提交类型时重新检查落点。转换票据接入施法结束/取消事件，锁定标志进入实际命令/移动/攻击消费者。仅对存在转换或计时形态的单位维护更新集合，永久熊/鸦形态不逐帧扫描。地图/公共资源继续只读、MPQ内存读取，不加载Game.dll。

来源为本机Warcraft III 1.27.0.52240的AbilityData/AbilityMetaData、NightElfAbilityFunc/Strings、UnitAbilities/Balance/Data/UI/Weapons、NightElfUnitFunc、MiscGame与UI/UnitEditorData的morphFlags；各成员来源归档和SHA-256保存在本地证据source.json。morphFlags依次为1不可打断、2即时落地、4即时起飞、8永久、16需要付费。付费转换、毁灭者、石像形态与钻地已接入，见[亡灵形态](undead-forms.md)；复合变身、其他原型及完整战役能力继续实现。

本批必要Win32 Release产品和新消费者编译通过。复制BootyBay地形的最小检查最终3通过/0失败，无Game.dll，覆盖熊往返/生命比例/人口/免费返回/动画状态，乌鸦起飞/高度/速度/落地，恶魔成长/库存/生命奖励/到期/死亡恢复。GPU、原版数值/转换时序、完整碰撞/路径类型、全部自定义覆盖/标志组合、取消/控制/所有权/回调重入、复活/运输/幻象组合、AI、音效和长局/性能/切图释放进入阶段合并验证，不能由上述结果推断通过。

```powershell
# cwd: G:/work/github/MEgine/watcher/war3
cmake --build --preset release --target war3 war3_unit_forms_tests --parallel 8
python tests/generate-unit-forms-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_unit_forms_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/unit-forms/fixture.w3m"
```

原始证据：仓库根tmp/docs-artifacts/war3/unit-forms/{source.json,source-rows.log,read-source.py,build.log,check-build.log,flow.log,fixture.w3m}。不提交原地图、资源或诊断产物。
