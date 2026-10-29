# 亡灵首关的空单位编组

Undead01 普通难度先按区域移除两名巡逻守卫，随后按对应区域查找单位并将结果加入编组。`GroupAddUnit` 对空或失效编组／单位无操作；有效单位仍只加入一次。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 Rizin 显示原注册入口 `0x6f1e6910` 分别解析编组和单位，任一为空时直接返回；指令见 `tmp/docs-artifacts/war3/human03-continuation-1031/undead01-group-rizin.txt`。

隔离 Win32 x86 探针确认普通难度原图的两个守卫位置被原图难度移除，初始编组时两个变量为空；修改后越过 GroupAddUnit 异常并进入后续脚本。下一处 `QueueUnitAnimation` 空单位异常尚需修复，记录分别为 `undead01-bounds2.log` 和 `undead01-after-group.log`。

待阶段验证：空／失效编组与单位、有效添加及去重，覆盖难度切换与亡灵首关真实开局；本次未验证完整剧情或战斗。
