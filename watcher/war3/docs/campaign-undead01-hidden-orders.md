# 亡灵首关隐藏单位的脚本命令

Undead01 救援侍僧时，原图先替换并对侍僧发出 `holdposition`；召唤流程创建新的侍僧后先 `ShowUnit(false)`，再下 `holdposition`。该订单触发到达动画和救援计数，达到目标后才能进入胜利流程。

脚本的字符串和整数 ID `stop`／`holdposition` 允许命令仅由 `ShowUnit(false)` 隐藏的单位；运输、吞噬等内部隐藏状态继续拒绝。玩家命令仍使用原有可见性限制；下达脚本命令不会改变单位可见性。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 Rizin 显示字符串入口 `0x6f1e9080` 转换订单后进入整数入口 `0x6f1e90a0`，后者解析单位并进入 `0x6f1e90d0` 的订单检查／分派；入口本身没有基于可见性直接拒绝的分支。指令见 `tmp/docs-artifacts/war3/human03-continuation-1031/undead01-hidden-order-rizin.txt`。原图对隐藏侍僧发令是行为依据；静态入口不足以证明所有内部隐藏状态在原版中的语义，仍需运行对照。

隔离 Win32 x86 探针将 Arthas 移至原图侍僧附近并临时设置无敌；修复前接触与召唤触发器各执行 4 次，到达为 0、救援计数为 0；修复后到达触发器执行 4 次、计数为 4。探针对另一个隐藏单位检查实际玩家命令被拒，脚本字符串和整数 ID 命令成功，模拟运输隐藏状态下脚本命令被拒且可见性不变。记录 `undead01-rescue-before3.log`、`undead01-rescue-final.log`，均位于 `tmp/docs-artifacts/war3/human03-continuation-1031/`。

待阶段验证：在原版 1.27 对照隐藏单位脚本订单、运输及吞噬状态与事件时序；在产品客户端自然救援达到目标、查看计数与胜利流程；覆盖停止／驻守的玩家权限、脚本重入和正在施法单位。探针没有验证完整对局或画面。
