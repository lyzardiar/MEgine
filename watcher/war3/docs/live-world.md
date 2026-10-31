# 运行中世界状态与脚本消费

2026-10-27。继续独立还原1.27.0.52240完整客户端，本阶段接入单位外观、运行中资源、区域/物品事件、视野、聊天与存储。实现不等于完整玩法或原版一致性通过，验证范围见testing-batches.md。

## 单位和资源

SetUnitColor、SetUnitVertexColor、SetUnitScale、SetUnitFlyHeight、SetUnitTimeScale、SetUnitAnimation/ByIndex与QueueUnitAnimation写入实际单位状态，由固定步进、模型序列、材质颜色/透明度、世界矩阵与选中圈消费。高度按指定速率逼近目标；拥有者变更保留或更新队伍色。ResetUnitAnimation沿用原Blizzard.j函数。

SceneStreaming拥有独立归档视图和后台线程，合并重复模型/图标请求，每批最多8项，保留一个待交付CPU批次。已存在的纹理名称传递给后台，避免重复解码；后台不修改正在绘制的资源。窗口线程接收CPU资产、遵守原预算、分帧上传，依赖齐备后绑定模型。尚未准备好的实例等待资源，解码/资源错误仍明确失败。退出取消并回收队列；GPU上传和持续切图释放需图形会话验证。

## 区域、聊天与物品

Region支持矩形并集/扣除、32单位格子和点/位置/单位查询；进入/离开、单位接近按模拟步进比较成员集合，派发带过滤器及上下文的事件。角色/聊天/触发器句柄仍归会话所有。注册后的事件可读取GetEnteringUnit/GetLeavingUnit/GetTriggeringRegion和聊天内容。精确区域量化、边界、创建/传送的原版事件顺序与大规模空间事件性能待核验。

Enter打开聊天输入，支持Unicode字符、退格、提交和Esc取消。提交调用本地玩家的真实聊天事件生产者；脚本DisplayText/DisplayTimedText写入有寿命的消息队列，HUD消费内联颜色与换行。完整源聊天布局、换行裁剪、频道及联网传播未完成。

物品栏容量读取库存能力定义，支持六槽持有、添加/取出、查询、物品随持有者位置更新及拾取/丢弃事件。HUD消费物品源图标和次数，右键槽位丢弃；已持有物品不绘制为地面物体。物品效果/使用、商店购买、英雄死亡保留/掉落、完整容量变更和重入边界继续实现。DotA最新main停在AddUnitToStock，商店是接续入口。

## 视野、天空与存储

每玩家FogGrid保存探索和可见状态，读取单位昼夜视野、共享视野及矩形/圆形fogmodifier；启停、销毁、先/后单位覆盖与查询使用同一状态。SetFogStateRect、SetFogStateRadius和SetFogStateRadiusLoc对调用时选定的玩家网格直接写入遮蔽、已探索或可见状态，并同步查询与绘制纹理；当前可见写入在后续视野重算时由单位和modifier重新决定，已探索状态保留。共享参数沿用当前来源玩家的共享视野联盟方向；区域边界、共享方向与持续性仍需原版对照。CPU网格目前64世界单位、8Hz更新，原版分辨率/刷新/遮挡规则仍需对照。FogRender将该纹理投射到地形、水面、选中圈和模型；敌方单位及小地图读取可见状态。标准D3D9使用managed纹理，D3D9Ex使用动态default纹理；错误退出清除纹理阶段。SetSkyModel也连接原MDX背景资源。以上新增GPU路径已编译，尚未取得本次画面证据。

Hashtable支持基本类型、句柄家族、父/子键、存在查询和清理；按源模块实际native签名绑定。gamecache已接入独立用户目录的持久化及基础单位快照，标量同步接入实验联机；原版w3v格式、完整单位同步与原版行为仍待实现或验证，见[战役 gamecache](campaign-gamecache.md)及[缓存同步](cache-sync.md)。字符串转换/格式/大小写/子串已接入，编码、边界与原版数值格式等待集中对照。

原图初始化在创建主计时器之前读取null计时器；TimerGetElapsed/Timeout/Remaining对null返回零，对无效非零句柄仍报错。

## 显式静音

`--mute`不打开输出设备。音频源仍从MPQ校验读取，WAV通过fmt/fact/data、MP3通过Layer III帧、标准MIDI通过轨道/tempo推导时长。AudioVoice保存真实时长、墙钟播放位置、循环、暂停、恢复、定位、速率和音量状态；声音渐变及音乐排队仍使用既有逻辑。普通有声路径继续使用固定Miles库内waveOut及DLS，未改变驱动标志。取消静音时重建有声voice；输出设备不可用会明确报错。

本次声音状态证据来自静音路径，不能替代实际声音、Miles设备、3D混音或听感验证。当前静音MIDI支持SMF格式0/1，不是XMIDI解码器；精确时长与设备端偏差等待对照。

## 本次必要证据与后续

- Win32 Release产品和定向消费者程序编译通过，无警告。
- Amazonia原globals/config/main与250ms推进退出0：102单位、55触发器、83事件，bj_gameStarted=true，无Game.dll；静音设备voice/DLS均为0。
- 原BootyBay复制夹具的1项集成检查通过：0.5秒创建新单位，物品三次事件、区域进入、视野覆盖/停止、typed storage、高度/外观状态和CPU后台模型交付均已检查；GPU交付保持未验收。
- DotA原main推进至121单位、13触发器、74事件，在 `Scripts/war3map.j:91823` AddUnitToStock明确失败，完整main和玩法未完成。
- 本会话为Disconnected，产品实际D3D9/9Ex/On12设备创建失败；新增画面/交互、缩放恢复和GPU释放进入阶段A队列。未关闭或重启用户编辑器/桌面会话。

最小夹具生成与执行：

```powershell
python watcher/war3/tests/generate-live-world-fixture.py --data-root '<原安装目录>'
cd watcher/war3
cmake --build --preset release --target war3_live_world_tests --parallel 8
./build/windows-x86/bin/Release/war3_live_world_tests.exe '<原安装目录>' '../../tmp/docs-artifacts/war3/live-world-fixture.w3m' '../../tmp/docs-artifacts/war3/live-world-streaming.log'
```

原图只读；复制夹具、日志和记录位于 `tmp/docs-artifacts/war3/live-world-*`，不提交。没有执行整库/旧引擎/全资产/逐位数值或三图完整回归，旧MEngine批次保持延期。下一步实现商店库存及购买/生产消费者，再继续推进完整对战、AI及客户端矩阵。

单位外观脚本接口对空、已移除或类型不匹配的单位按原版处理：颜色、缩放、飞行高度和动画设置直接返回，高度查询返回零；有效单位继续使用实时状态。固定版 Game.dll 的对应入口及分支通过只读静态指令核对，脚本调用的实际地图和原版运行表现待阶段验证。

`SetUnitScale` 读取第一个缩放参数并等比应用于三个模型轴；场景模型、阴影和单位缓存使用同一状态。固定版 Game.dll 注册入口 `0x6f1f7a40` 只读取首个实数并向模型传递一个缩放值。非有限值、负值和极大值当前仍受客户端范围检查约束；极值与画面表现待原版对照。
