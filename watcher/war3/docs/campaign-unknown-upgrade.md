# 战役未知科技引用

兽族第四章 `Maps/Campaign/Orc04.w3m` 的原地图脚本为玩家 2、3 设置科技 `Rewd`；该地图没有 `war3map.w3q`。本机 `War3Patch.mpq`、`War3x.mpq`、`war3.mpq` 的 `Units/UpgradeData.slk` 均没有 `Rewd`，而 `Units/UnitBalance.slk` 的小精灵 `ewsp` 升级列表仍引用 `Rewd,Reuv`。原图使用该单位时，已记录但没有源定义的科技不会再导致会话中断；它不产生臆造的数值效果。已有定义但尚未支持的科技效果仍按原路径明确报错。

固定版 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。`SetPlayerTechResearched` 的 `0x6f1f6440` 进入 `0x6f1da190`，后者先调用 `0x6f24d580` 操作玩家科技，再调用 `0x6f6ad030` 查询对象；对象不存在时跳过后续应用分支。此静态路径与无定义时不应用升级效果的实现一致，未知 rawcode 的全部运行时语义及原版科技记录仍需实机对照。

最小复现及归档清单见 `tmp/docs-artifacts/war3/orc04-scan.log`、`tmp/docs-artifacts/war3/orc04-upgrade/probe.log`。隔离 x86 探针链接当前核心和修改后的研究消费者，原图 main 完成，创建 228 个单位并静音推进 60 秒，退出 0、未加载 Game.dll；日志 `tmp/docs-artifacts/war3/orc04-upgrade/after.log`。完整战役、未知科技查询、真实窗口与源升级／自定义升级仍待集中验证。
