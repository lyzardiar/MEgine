# Human08 的堆叠环境声音

Human08 原图通过 `CreateSound(..., false, true, true, ...)` 创建海浪声音，再将其注册到九个堆叠声音区域。区域注册接收非循环数字声音，并继续使用现有区域声音播放路径；坐标、格式和区域上限仍按既有规则检查。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 Rizin 观察到 `RegisterStackedSound` 注册入口 `0x6f1f2be0` 在声音句柄有效时转发参数到 `0x6f226c10`；这段入口未检查创建时的循环标志。指令见 `tmp/docs-artifacts/war3/human03-continuation-1031/stacked-sound-rizin.txt`，不代表已确认完整音频播放语义。

隔离 Win32 x86 静音探针加载 Human08 原图后越过原注册异常，约 80 秒恢复玩家控制并推进至 400 秒；见 `tmp/docs-artifacts/war3/human03-continuation-1031/human08-stacked-after.log`。

待阶段验证：在原版和客户端听验非循环标志声音作为堆叠区域时的播放及重复时序、区域移动与注销、空间衰减和重叠行为；验证常规循环声音与静音资源释放。当前静音探针不证明音质或原版音频一致。
