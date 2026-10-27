# AI暂停、守卫与部队控制

PauseCompAI、SetUnitCreepGuard、RemoveGuardPosition、RecycleGuardPosition和RemoveAllGuardPositions已连接实际会话。AI专用AddGuardPost、FillGuardPosts、ReturnGuardPosts、SetReplacementCount、GroupTimedLife、IgnoredUnits、ResetCaptainLocs、ShiftTownSpot和ClearCaptainTargets也有实际消费者。

## 暂停与调度

暂停计数按玩家隔离。REA/Rizin确认原PauseCompAI入口0x6f1f1ab0跳转0x6f892840，对AI对象+0x1d8做32位加一/减一；0x6f8912d0按非零判断暂停，0x6f8924da分支消费该状态。因此重复暂停需要逐次解除；不平衡解除产生非零回绕值时仍暂停，未将原计数改为布尔开关或钳制到零。尚无运行AI的玩家调用保持无操作，符合原入口的AI句柄检查。

共享调度域中的任务记录所属VM。暂停只阻止该玩家策略线程和AI心跳，地图脚本、其他AI、模拟时间及既有单位命令继续推进。暂停期间创建的线程排队；自暂停在下一条VM指令边界挂起。恢复后保留先前睡眠的剩余时间，取消能展开挂起或未启动任务。当前“冻结剩余等待”的时间选择已有本实现检查，原版Sleep在AI暂停期间的计时语义仍待对照。

## 守卫与部队

- 岗位保留原单位类型、位置、单位归属、补员状态及稳定ID。实际占用单位不会进入突击队，IgnoredUnits反映岗位保留及被排除的定时生命单位。
- FillGuardPosts优先分配现有可用单位。缺员经过现有训练或建造队列申请，消费源费用/前置/人口与事件，不免费创建补员；完成后的空位在AI心跳重新匹配。SetReplacementCount限制岗位丢失后的补员次数，当前默认0和-1无限规则仍待原件行为核对。
- ReturnGuardPosts及空闲归位连接moveUnit；工作/采集/施工/施法/暂停单位保留相应状态。守卫自动追击复用原GuardDistance、MaxGuardDistance、GuardReturnTime配置；目标失效后返回岗位。普通中立守卫也会在目标失效后返回。
- 原SetUnitCreepGuard入口0x6f1f7450读写单位+0x60的4位；现有单位状态和实际追击返回消费该开关，默认中立敌对单位启用。岗位归属与此开关分别保存。
- RemoveGuardPosition解除岗位保留；RecycleGuardPosition重新登记当前单位位置；RemoveAllGuardPositions只处理目标玩家。原Remove/Recycle入口和后续调用已定位，完整角色分类及重登记细节仍需行为对照。
- 岗位使用稳定ID快照，付费命令的事件回调可移除/新增岗位。单位死亡、移除和转让按单位/控制者/岗位ID检查，避免旧岗位清除新归属的状态。
- GroupTimedLife控制突击队是否纳入定时生命单位；清除队长目标连接实际停止命令，重置位置恢复默认基地锚点，ShiftTownSpot由实际建筑选址消费。

## 必要检查与证据

新增2项调度检查通过、0失败：跨VM暂停隔离/剩余等待、暂停期间创建、自暂停、稳定恢复与取消。真实会话3组通过、0失败：两AI独立推进及嵌套/回绕计数，岗位/定时生命保留、转让清理与跨玩家移除，缺员实际扣费入队且没有免费单位。

亡灵原AI通过BootyBay原main的电脑槽启动并推进2秒：1城镇、1生产队列、2待建/施工、5脚本线程，无Game.dll。此时没有持续工作订单，检查依据真实生产/施工状态判断；不把人族工人持续作业方式作为亡灵召唤施工的前提。该结果仅证明开局及RecycleGuardPosition入口，没有验证建筑完成、收入或完整对局。

必要Win32 Release产品及消费者编译通过。最初消费者误访问私有definitions接口，已改用公开native价格查询并编译通过；初始日志保留。没有运行旧全套、三图/全族完整回归、GPU或性能基准。

证据目录：仓库根tmp/docs-artifacts/war3/ai-control/。主要记录为build.log、consumer-build.log、delivery-build.log、startup-final-build.log、pause-smoke.log、session-smoke-final.log、undead-startup-final.log和rea-evidence.json。REA记录的Game.dll摘要始终为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，读取前后未变；原件保持只读，程序未加载Game.dll。

~~~powershell
cmake --build --preset release --target war3 war3_jass_thread_tests war3_ai_control_tests war3_ai_tests --parallel 8
./build/windows-x86/bin/Release/war3_jass_thread_tests.exe paused_vm_isolation_and_remaining_wait self_pause_and_deferred_creation
python tests/generate-ai-control-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_ai_control_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/ai-control/fixture.w3m"
./build/windows-x86/bin/Release/war3_ai_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/(2)BootyBay.w3m" 2 2
~~~

## 阶段待完成与验证

完整四族/战役AI、初始/后续单位的原版自动守卫登记、英雄复活/施法/购买、路径/运输/变形、全部native及重开AI仍待实现。原版暂停时机/等待计时、岗位选择/默认补员/数量/丢失分类、追击/返回/离开/所有权、地图/AI回调顺序、组建和定时生命规则仍待阶段对照。

阶段合并岗位替换完成/资源不足/前置/人口/阻塞/取消、事件重入删除/转让、同型多岗位/重复回收/无AI单位、长时嵌套暂停/等待/join/退出、清目标/基地锚点/选址，以及三图长局、GPU、CPU/内存与切图释放。本项没有关闭完整AI或完整客户端验收。
