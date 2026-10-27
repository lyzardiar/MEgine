# 可破坏物、动态阻挡与基础伐木

2026-10-27。原 DOO 可破坏物在脚本全局初始化前进入会话；场景和脚本共享生命、可见性、动画及移除状态。装饰物和可破坏物复用原 SLK/metadata/w3b/w3d 读取器，运行不生成解包目录。

## 实际消费者

- 原 DOO 记录映射为 destructable 句柄，保留类型、变体、位置/旋转/比例、生命百分比和编辑器ID。Create/Dead/Z、移除/死亡/恢复、生命/最大生命、无敌、显示、动画队列与速度连接实际状态和绘制。
- 通用 Widget 的坐标/生命、死亡事件及 GetTriggerWidget/GetTriggerDestructable、矩形枚举/过滤上下文、hashtable句柄读写和目标/集结查询连接同一对象。遮挡高度查询读取源值；遮挡修改和完整视线遮挡仍未实现，未绑定无消费的setter。
- pathTex/pathTexDeath 直接读入内存，按 RGB 维护行走/飞行/建造阻挡。每格记录重叠物件的引用计数，移除一棵树只释放它的占用，保留原WPM及重叠对象。新增阻挡才使进行中的路线重新计算；移除阻挡供后续路径查询使用。
- 初始物件保持分块视锥裁剪；新建物件走已有后台模型/纹理读取和GPU交付。资源增删按版本处理，不在静止帧重复遍历全部可破坏物。脚本中的生命、隐藏和动画变化由共享状态直接绘制。
- Ahar/Ahrl 工人按源 Dur、DataA对树伤害和DataB木材容量砍树，满载返还 Artn 木材基地；停止保留负载，耗尽后在源搜索范围内寻找下一棵树。Awha 小精灵按源 Dur 周期、DataA产量直接获得木材并保留树生命。源能力按钮、右键与JASS目标订单共用流程，集结到树木可由新训练工人继续采集。

事件和计时器维护独立句柄列表，固定步进、单位/玩家/聊天/空间事件不再因为 DOO 增加数千句柄而扫描全部物件。此为复杂度上的改进，尚无帧耗时基准结论。

## 来源与开发检查

源 DestructableData/DestructableMetaData、W3B、DOO、pathTex 和 Harvest/Wisp Harvest 能力字段已读取。BootyBay 的1,411棵样本树中，1,407个中心WPM字节为64，另外4个仍带地形行走限制；Amazonia所选树类型199个中心均为64。这支持分层保留WPM的实现，不能据此断言所有地图均一致。原始数据为 tmp/docs-artifacts/war3/destructables/source-definitions.json、wpm-source-cells.json。

必要 Win32 Release 产品/专项消费者编译通过；DotA原DOO创建3,871个可破坏物，原main与首250ms模拟退出0、bj_gameStarted=true、无Game.dll。证据为同目录 build-final.log、dota-final-250.log。此为新加载层的阻塞检查，不证明伐木操作、GPU或原版一致性通过。

专项消费者已编译，行为执行待阶段验证：

```powershell
python watcher/war3/tests/generate-destructable-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
cd watcher/war3
./build/windows-x86/bin/Release/war3_destructable_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/destructables/fixture.w3m'
```

覆盖重叠占用、死亡/恢复、Widget事件/枚举/句柄、木材返还和小精灵不破坏树。原版时序/攻击周期、伐木升级、路径形状/旋转/窄口、死亡重入顺序、载入前后动态创建、模型队列、声音/掉落、门/桥/悬崖特例、无WPM地图、小精灵附着/转树表现及完整视线遮挡仍待实现或对照。完整对战与UI还原目标保持未完成。
