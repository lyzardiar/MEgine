# 召唤道具与迷你建筑

2026-10-28。源版本为Warcraft III 1.27.0.52240。实现连接库存使用、原数据与实际单位／建筑状态；玩法和原版一致性保持阶段待验证。

| 原型与原版派生 | 实际消费 |
| --- | --- |
| AIfs：AIfd／AIff／AIfr／AIfu／AIfh／AIfs／AIir／AIuw | 分别读取DataA／DataB数量和DataC／DataD单位类型；支持两组、真实落点、归属、召唤事件、源buff和限时生命 |
| AIsh、ANwm及AIwm | UnitID与各自DataB／DataA数量、源时限；重复使用保留之前仍存活的道具召唤物 |
| AUin及AIin | 库存选点接已有地狱火延迟、落地范围伤害／眩晕和真实限时召唤 |
| AIrd | 库存使用接已有尸体检索／消耗、源骷髅数量、召唤事件和限时生命 |
| AIbl：AIbl／AIbg／AIbt／AIbb／AIbf／AIbr／AIbs／AIbh | 源UnitID列表按玩家种族选择；地图覆盖支持单类型及最多5个条目；原占地网格／模型预览、吸附、地形／荒芜／边界／动态阻挡、接近、施工、取消和完成事件 |

session_item_summons.cpp共用beginSpell、itemSpellReady和commitItemSpell，按原库存槽发布订单。数量、魔法、共享物品冷却及使用事件沿用库存消费。未支付前失效取消施法；回调后的状态再次检查。AIfs的DataC是单位rawcode，独立解析，避免误作为数值。

迷你建筑的Dur为施工时间。实际建筑使用Construction::Method::Summon，无需工人持续施工；金木费用为0，取消不会凭空退还建筑原价。人口预留、完成供给、施工受伤、暂停／冻结、销毁与易主沿用建筑生命周期。施法距离按建筑外沿计算，避免持有者接近中心后阻挡施工。种族解析与GetPlayerRace共享同一缓存，按玩家归属选择，不依据英雄种族。

来源为只读安装目录的AbilityData／ItemData、Profile和单位表，地图对象覆盖仍走ObjectData。REA核对CAbilityItemBuild的0x6f53b0b0：解析最多5个UnitID；单条直接使用，多条按玩家种族索引。Game.dll SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，仅开发分析使用。原始表、摘要、读取脚本、REA和构建记录位于仓库tmp/docs-artifacts/war3/item-summons/。

必要Win32 Release产品增量编译通过，无编译警告。验证命令为在watcher/war3执行cmake --build --preset release --target war3 --parallel 8及git diff --check。没有运行新增玩法夹具、三图、窗口／GPU、原版对照或性能测试。

阶段集中验证：各派生与地图覆盖、两组／零数量／上限与落点不足、重复召唤、尸体不足、地狱火延迟及伤害、六槽／共享冷却／库存移除／事件取消；四族与不同种族英雄、单类型／5条与无效种族、原网格／原模型／红绿预览、远距接近与取消、禁止地形／障碍／金矿、免费施工／0时限／人口／受伤／暂停冻结／取消与易主，以及原按钮／热键／音效／AI、三图长局／性能／切图释放。

AIpm地雷和AImo诱饵的实际触发／爆炸／引诱流程见[地雷与诱饵](mines-lure.md)。Amec机械小动物的动物类型选择、召唤与敌方伪装见[机械小动物](mechanical-critters.md)，原版精度待阶段对照。当前库存订单、道具召唤布局／随机／原事件精确次序、施工与角色位移的原版细节仍待对照；不据编译通过宣称完整道具或客户端验收。

零召唤数量的物品能力允许执行并发布施法事件，不要求配置召唤单位；有正数量的组仍校验单位类型及可用落点。DotA 刷新球使用的 `A02W` 是零数量 `AIfs`；`UnitResetCooldown` 清除单位技能冷却并保留物品冷却。原版 1.27 入口 `0x6f1fb270` 调用 `0x6f471690` 遍历单位能力并对匹配类型重置，反汇编见 `tmp/docs-artifacts/war3/dota-refresher/original-reset.txt` 和 `original-reset-ability.txt`；此静态证据未单独证明所有物品冷却边界。DotA 原图隔离会话使用刷新球后，预置技能冷却清零、其他物品冷却保留，刷新球自身进入约 195 秒冷却；记录 `tmp/docs-artifacts/war3/dota-refresher/after-reset.log`。真实购买／使用及不同物品的原版冷却行为仍需运行对照。
