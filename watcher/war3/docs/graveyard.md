# 墓地尸体生成

单位的 `Agyd` 墓地能力从原版或地图覆盖的 AbilityData 读取尸体上限、墓碑范围、尸体范围、生成单位和冷却间隔。完成的有效单位按间隔生成实际死亡单位，接入现有尸体衰败、装载、食尸与亡者复生流程；生成单位不产生训练或死亡事件。生成器跟随单位暂停、隐藏、建造、移除及能力生命周期，不遍历所有尸体。

本机固定版本源数据 `Agyd` 的最大尸体数为 5、墓碑范围 200、尸体范围 250、尸体类型 `ugho`、间隔 15 秒；字段名称来自 `AbilityMetaData.slk` 对应的 `Gyd1`、`Gyd2`、`Gyd3` 和 `Gydu`。固定版 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；`Agyd` 注册与墓地能力生命周期汇编见 `tmp/docs-artifacts/war3/graveyard-source-asm.txt`、`graveyard-lifecycle-asm.txt`。

当前以墓地自身生成且仍在尸体范围内的尸体计数，以确定性角度和墓碑范围的 65% 布置生成点；首次生成、满额后的时钟、尸体归属、墓碑对象、落点、移动／转让、范围及尸体老化行为是待核对的实现，尚未证明与原版一致。地图能力动态增加／删除和覆盖支持实际能力读取；变形切换、原版特效与音效、多人同步及完整对局仍需验证。

Win32 Release 产品及尸体测试程序编译通过；`war3_corpse_cargo_tests.exe <data-root> <corpse-cargo-fixture.w3m> graveyard` 在实际会话中检查首次 15 秒生成、尸体类型与可用性、五具上限和移除后补充，1/1 通过，未加载 Game.dll。此检查没有覆盖上文待核对的原版行为及窗口。

原字段取自 `War3Patch.mpq`：`Units/AbilityData.slk` SHA-256 `ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec`；`Units/AbilityMetaData.slk` 为 `42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6`；`UI/WorldEditStrings.txt` 为 `434929fc86e4f519afa9dcd028d05b86b75199c76d7ed8d103b3a573e898c533`。
