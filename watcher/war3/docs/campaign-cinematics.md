# 战役镜头与对话

地图脚本可创建相机配置、设置七类字段和目的地，并应用带时长／高度的配置；支持单位目标与朝向跟随、默认镜头恢复、源与目标震动及平滑参数。状态连接模拟时钟和游戏视图，单位移除时解除跟随。具体跟随偏移、震动波形、平滑与镜头插值的原版精度仍待对照。

ShowInterface 控制 HUD 与原版过场视域，过渡期间视域随时间变化；SetCinematicScene／EndCinematicScene 保存计时对白，从对象定义及地图覆盖查找肖像模型，在原版 CinematicPanel FDF 上显示说话人／字幕并播放肖像动画，支持单位颜色与四族边框皮肤。UI 元素的完整淡入淡出、普通 HUD 与对话层次、肖像动画和实际配音表现仍待阶段验证。

SetDoodadAnimation／SetDoodadAnimationRect 将矩形或圆形内的装饰物动画保存到世界，在场景同步时应用到静态 DOO 与可破坏物；支持最近对象和随机初相。主题音乐独立于地图音乐播放与结束；八类原声音组按源声道和一秒渐变调整声量。区域循环声音保留多个矩形，并按镜头位置与距离调整实际播放；普通空间声和附着单位声音按位置与距离控制播放。地图读档、界面相机、音量混合、区域音衰减／3D 声像与物件的完整原版一致性尚未验收；普通空间声已按镜头朝向计算左右声像并应用声锥衰减，区域堆叠声尚未接入声像；证据与原件 FDF 在 tmp/docs-artifacts/war3/campaign/。

EnableOcclusion 使用镜头到可见单位的空间块查询，将挡路物件按源颜色和时间淡化；EnableWorldFogBoundary 独立控制 W3E 边界的雾绘制，逻辑视野保持独立。当前遮挡几何为近似，轮廓标记、透明排序、边界取样及原版精确外观仍待完成或对照。

最小运行证据：Prologue01 原图 main 初始化及前 2 秒静音模拟通过，58 单位、183 触发器，未加载 Game.dll；过场 FDF 四族皮肤在隐藏窗口完成绘制。完整对白、实际画面和声音仍待阶段验收。日志在 tmp/docs-artifacts/war3/campaign/prologue-occlusion-check.log。

小地图 PingMinimap／PingMinimapEx 连接提示状态、皮肤模型与声音，多个提示使用独立模型实例；UnitAddIndicator／AddIndicator 将临时颜色连接单位、物品和可破坏物，保留现有透明度。SetUnitLookAt／ResetUnitLookAt 将目标和偏移连接单位骨骼姿态；过场禁用操作时，Esc 将玩家结束过场事件发送给已启用的注册触发器。模型朝向、闪烁叠色／时间、小地图尺寸／粒子／声音、Esc 条件和原版精度均待阶段验证。

Win32 Release 产品编译通过；Prologue01 的 20 秒静音模拟通过初始化及此前 PingMinimap 阻塞，随后在 TriggerWaitForSound 未绑定处停止，尚不能认为 20 秒模拟完成。日志：tmp/docs-artifacts/war3/campaign/prologue-next-integrated.log。

TriggerWaitForSound 将脚本线程挂起并跟踪当前声音播放位置，声音停止或达到正偏移提前点后恢复；释放句柄后的独立播放继续供等待使用。静音离线模拟使用模拟时钟推进声音，普通游戏仍使用实际音频时钟。原版入口会保存声音指针及偏移，空声音、负偏移、等待唤醒时序和变速精度仍待原版对照。

Win32 Release 产品编译通过；Prologue01 原 main 及静音模拟已越过 TriggerWaitForSound，随后在 SetUnitFacingTimed 未绑定处停止。日志：tmp/docs-artifacts/war3/campaign/prologue-sound-wait.log。

SetUnitFacingTimed 在固定模拟步进中沿最短角度更新单位朝向；即时设定、移动、战斗、施法及扎根等朝向写入会覆盖转向。原版插值曲线、180 度方向、暂停与命令优先级待阶段对照。

Win32 Release 产品编译通过；Prologue01 原 main 与前 20 秒静音模拟通过，bj_gameStarted=true，仍有 1 个脚本线程，未加载 Game.dll。日志：tmp/docs-artifacts/war3/campaign/prologue-facing.log。此结果不代表完整战役通过。

GetCameraTargetPositionLoc 创建独立 location 并读取当前相机目标位置，供原版 SmartCameraPanBJ 教程救援路径使用；该位置与现有相机目标 X／Y 查询共享同一状态。镜头跟随和玩家操作与脚本查询的时序仍需阶段验证。
