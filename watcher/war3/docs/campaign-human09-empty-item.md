# Human09 空物品槽的创建

Human09 的霜之哀伤剧情从穆拉丁的每个背包槽取物品类型并在地面重建。空槽的类型为零。`CreateItem` 在类型没有对应物品定义时返回空句柄，不创建对象；有效类型继续沿用原有创建路径。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 Rizin 观察 `CreateItem` 注册入口 `0x6f1de200` 调用 `0x6f63a040`，后者在类型查找失败后返回空对象，句柄转换 `0x6f2651d0` 跳过空对象；指令见 `tmp/docs-artifacts/war3/human03-continuation-1031/human09-create-item-rizin.txt`。

隔离 Win32 x86 探针将 Arthas 移到原图守护者区域并临时保护英雄，随后直接击杀守护者；剧情越过此前空槽创建异常，约 320 秒恢复控制并推进至 400 秒。日志 `tmp/docs-artifacts/war3/human03-continuation-1031/human09-frostmourne-after.log`。这不验证正常战斗、自然移动或客户端画面。

待阶段验证：`war3_spell_tests` 中验证零类型、未知类型不创建物品及正常类型创建；在客户端验证持有不同物品数量时的霜之哀伤剧情、物品放置与拾取。
