# DotA 臂章与携带物品移除

携带物品被移除时，背包先释放槽位并刷新装备，再为单位及玩家派发丢弃事件；事件期间物品句柄和类型仍可访问。移除过程阻止再次拾取和递归移除，事件结束后销毁物品。地面物品移除不派发丢弃事件。

DotA_v6.83d 的臂章脚本通过丢弃事件结束计时并撤销属性。原图隔离会话从关闭状态开启并再次关闭：力量 22 → 47 → 22，最大生命 518 → 993 → 518，攻击装备加成为 9 → 40 → 9；记录位于 `tmp/docs-artifacts/war3/dota-armlet/final.log`。

Win32 Release 客户端及专项程序编译通过；`war3_mobility_tests.exe <data-root> <fixture> remove-item` 覆盖单位与玩家事件、上下文、事件中递归移除及地面物品，1 通过、0 失败；`powerup` 拾取检查 1 通过、0 失败。夹具使用 `python tests/generate-stealth-fixture.py --data-root <data-root> --output <fixture>` 生成。

以上为独立客户端隔离证据；原版相同版本的事件时序及各种移除原因、购买与实际输入、多人同步和画面仍待验证。
