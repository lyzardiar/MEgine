# 基础采集循环

2026-10-27。采金命令、矿井状态和资源计数接入同一个 ScriptSession。原版能力与 w3a 覆盖提供采集量、周期、射程及容量，资源仍直接从归档读取。

- Ahar 工人对 Agld 矿井排队，按矿井 DataB 周期和 DataC 容量进矿；携金数量来自工人 DataC。出矿后寻找本方具有 Artn 金币回收能力的建筑，移动/返还，再继续原矿井。取消、移动和停止保留已携带资源。
- Aaha 工人在本方 Abgm 矿旁持续采金；Awha 工人进入本方 Aegm/Aenc 矿。产量、周期、容量来自矿井能力，按容量分配产量并保留整数结算余数。原版默认5个工人共享每秒10金的产量上限；精确调度仍待原件验收。
- 矿量扣减有界，最后不足一包按剩余数量结算。空矿死亡，等待者结束采集；工人死亡/移除/换令及矿井失效释放占用。单位暂停冻结采集剩余时间。
- 资源返还/直接收入更新当前资源与累计采集状态并派发实际玩家状态事件，使用玩家金币／木材维护费状态13/14。人口变化接通维护费计算；盟友资源转移与交易税已连接实际入账。
- 原版采集/返还按钮、图标、位置和热键来自能力 Profile，右键及 JASS harvest/returnresources 使用同一路径。HUD显示携带量与矿量，原模型的 Walk Gold/Stand Gold 动作用于携金外观；进矿工人停止可见绘制和自身视野贡献。

源依据包括 Ahar/Agld/Abgm/Aegm/Aenc/Aaha/Awha/Artn 的 AbilityData 与 Profile，原 peasant/peon/acolyte 模型 SEQS。必要原始属性记录为 tmp/docs-artifacts/war3/economy/source-abilities.json；编译记录为同目录 build.log。原安装只读，不生成解包资产。

本项只完成已有矿井上的基础采金实现。树木句柄/生命、计数阻挡和基础伐木已接入，范围见 [可破坏物与伐木](destructables.md)；基础建造与矿井缠绕/召唤转换已接入，见[建造与矿井转换](construction.md)；拥挤/出入口位置、可达基地选择、矿内工人的完整选择/卸载UI、附加特效/声音、升级/税费和原版精确资源时序仍待完成。

必要 Win32 Release 客户端和 war3_harvest_tests 编译通过；没有运行本项专项消费者、GPU或对战性能测试。待阶段执行：

```powershell
python watcher/war3/tests/generate-harvest-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
cd watcher/war3
./build/windows-x86/bin/Release/war3_harvest_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/economy/fixture.w3m'
```

专项检查人族携金/返还、停止后保留负载、有限矿最后一包和耗尽、亡灵/精灵直接收入、暂停和矿移除。容量满载、兽族完整输入、事件重入、资源速率/人口税费、真实地形可达性与三图完整对局继续在阶段队列中验证。

## 人口维护费

人口状态变化连接维护费计算，涵盖单位创建／死亡／移除／易主、生产预留／取消及脚本设置人口；计算结果供采集资源入账和顶栏显示消费。`war3mapMisc.txt` 的 `[Misc] UpkeepUsage`、`UpkeepGoldTax`、`UpkeepLumberTax` 支持列表覆盖；缺省使用经典 40／70 或资料片 50／80 人口阈值、金币 0／30／60% 和木材 0%。地图提供较短列表时使用最后一项补齐；脚本显式设置对应玩家维护费状态后保留该项覆盖。

原 Game.dll 1.27 SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；固定 Rizin 0.8.1 对原件的有限观察：`0x6f02ac00` 读取 `UpkeepUsage`、`0x6f02aa27` 读取 `UpkeepGoldTax`、`0x6f02ab37` 读取 `UpkeepLumberTax`；`0x6f951e40` 的两组阈值和 `0x6f0016a0`／`0x6f001830` 的缺省税率初始化提供数据依据。运行客户端不加载原件。

原版人口切换边界、模式选择、脚本显式修改维护费后的生命周期、短列表补齐、浮点转换与入账取整、状态事件重入及原版顶栏文字／布局均留阶段验证；目前顶栏显示金币税率。`SetPlayerTaxRate` 与 `GetPlayerTaxRate` 分别保存和查询玩家对的金币／木材税率，资源赠送使用该状态；交易税不会用于采集。完整玩法、HUD、三图、性能与无解包增长保持阶段待验证。

## 盟友资源转移

F11／顶栏入口使用原版 AllianceDialog 与 AllianceSlot FDF 显示在线玩家及本地联盟状态；可为盟友填写金币／木材，接受后逐人提交转移，取消不扣款。每次转移在提交前检查活动玩家、联盟、余额与接收上限，两个资源同时扣减并记入接收方，税损、赠出和收到数接入玩家分数。脚本税率按原件仅接受金币／木材状态，并对无符号整数截到 100。暂停菜单与场景操作不会透传联盟面板输入。

原 Game.dll 1.27 SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；REA 静态观察 `SetPlayerTaxRate` 入口 0x6f1f6380，金币／木材设置入口 0x6f24cda0／0x6f24cf10，分别按首玩家对象和第二玩家 ID 保存无符号限制到 100 的税率。具体赠送消费者尚未定位：当前按发送方对接收方税率、税损向下取整并扣除，赠出记原额、收到记净额；方向、取整、统计和事件顺序均待原版对照。联盟／视野／单位共享与共同胜利复选框暂为只读，尚未实现面板修改；网络同步和真实窗口交互仍待完成或验证。

Win32 Release 产品增量编译通过；BootyBay 最小会话检查有效转移、余额不足不产生部分扣款、税率边界通过，原 FDF 隐藏窗口构造及绘制通过，均未加载 Game.dll。证据在 tmp/docs-artifacts/war3/transfer-probe/ 与 alliance-probe/。未验证原版交易精度、完整游戏界面或局域网。
