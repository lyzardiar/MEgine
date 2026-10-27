# 脚本等待与协作线程

Runtime使用Win32 fiber保留JASS帧、局部槽/数组、返回栈及Native→JASS重入栈。每个线程独立保存指令预算、同步条件限制和ScriptContext；globals、句柄和会话状态共享。线程只在固定模拟时间到期或等待的子线程结束后恢复，不并发执行游戏状态。

实际入口为TriggerSleepAction、ExecuteFunc、TriggerExecute/TriggerExecuteWait及timer callback。TriggerWaitOnSleeps控制同一触发器动作串行或分别启动；条件/过滤使用invokeNoYield，非法等待明确报错。AI模块声明Sleep/StartThread时复用调度器，尚未实现完整AI加载和native。

地图main允许等待。mainStarted表示已启动且未失败，mainCompleted仅在main真实返回后成立；游戏视图可推进已启动的main。产品--main-check记录waiting/completed和活动线程数，模拟后main仍未完成时退出2。

线程每次恢复重新获得指令预算，无等待死循环仍触发上限。sleep使用实际32位Real参数，至少等待下一1/32秒量子；当前到期时间不做原版最小等待/量化的精度承诺。默认最多1,024个线程、32个完成栈复用，单栈64KiB提交/256KiB保留，保留浮点状态，支持加载线程向游戏线程顺序迁移。

会话销毁先取消线程，再销毁句柄/单位等成员。取消从等待点展开完整C++栈，使原生回调RAII在有效会话内释放。完成栈才允许进入复用池，不直接删除含有挂起RAII的栈。

## 最小运行证据

本组修改涉及底层回调生命周期和跨OS线程栈迁移，执行开发必需CPU检查。VM共10项最终通过：首次8通过/2失败；失败由检查采用1/32精确边界但实际脚本Real为0x3d000001导致，校正检查后仅重跑这2项，2通过/0失败。生产时钟未提前唤醒。涵盖局部数组/返回栈、Native回调续跑/取消、顺序/globals、等待子线程、上下文、跨OS线程、指令/线程预算、同步条件限制、栈复用和销毁。

实际ScriptSession共5组通过/0失败：等待main、两个玩家/单位同时等待的事件、sleeping timer销毁、串/并行动作与join、会话成员销毁前RAII释放。BootyBay原main/250ms最小集成退出0，main_completed=true、script_threads=0、bj_gameStarted=true，无Game.dll。产品/两个消费者编译通过；未运行GPU、三图完整回归和性能。

原始证据：仓库根tmp/docs-artifacts/war3/script-threads/{build-final.log,smoke.log,smoke-retest.log,session-build.log,session-smoke.log,bootybay.log}。fixture从原BootyBay内存读取后写根tmp，原安装只读。

```powershell
cmake --build --preset release --target war3 war3_jass_thread_tests war3_session_thread_tests --parallel 8
python tests/generate-thread-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_session_thread_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/script-threads/fixture.w3m"
```

## 阶段待完成/验证

原版等待最小值/量化、暂停和游戏倍率、各事件getter跨wait的有效期、复杂触发器销毁/重入/顺序、Sound wait、完整AI、LAN确定性和长时间CPU/内存/切图仍需实现或对照。当前检查只证明本实现的实际调度/生命周期，不能替代完整原版线程语义验收。
