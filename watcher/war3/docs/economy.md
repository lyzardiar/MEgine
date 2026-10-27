# 基础采金循环

2026-10-27。采金命令、矿井状态和资源计数接入同一个 ScriptSession。原版能力与 w3a 覆盖提供采集量、周期、射程及容量，资源仍直接从归档读取。

- Ahar 工人对 Agld 矿井排队，按矿井 DataB 周期和 DataC 容量进矿；携金数量来自工人 DataC。出矿后寻找本方具有 Artn 金币回收能力的建筑，移动/返还，再继续原矿井。取消、移动和停止保留已携带资源。
- Aaha 工人在本方 Abgm 矿旁持续采金；Awha 工人进入本方 Aegm/Aenc 矿。产量、周期、容量来自矿井能力，按容量分配产量并保留整数结算余数。原版默认5个工人共享每秒10金的产量上限；精确调度仍待原件验收。
- 矿量扣减有界，最后不足一包按剩余数量结算。空矿死亡，等待者结束采集；工人死亡/移除/换令及矿井失效释放占用。单位暂停冻结采集剩余时间。
- 资源返还/直接收入更新当前资源与累计采集状态并派发实际玩家状态事件；使用当前显式维护费状态13/14。自动计算人口维护费和跨玩家税收尚未实现。
- 原版采集/返还按钮、图标、位置和热键来自能力 Profile，右键及 JASS harvest/returnresources 使用同一路径。HUD显示携带量与矿量，原模型的 Walk Gold/Stand Gold 动作用于携金外观；进矿工人停止可见绘制和自身视野贡献。

源依据包括 Ahar/Agld/Abgm/Aegm/Aenc/Aaha/Awha/Artn 的 AbilityData 与 Profile，原 peasant/peon/acolyte 模型 SEQS。必要原始属性记录为 tmp/docs-artifacts/war3/economy/source-abilities.json；编译记录为同目录 build.log。原安装只读，不生成解包资产。

本项只完成已有矿井上的基础采金实现。树木当前仍是静态 DOO 场景，伐木需可破坏物状态及动态路径；建造、矿井缠绕/召唤转换、拥挤/出入口位置、可达基地选择、矿内工人的完整选择/卸载UI、附加特效/声音、升级/税费和原版精确资源时序仍待完成。

必要 Win32 Release 客户端和 war3_harvest_tests 编译通过；没有运行本项专项消费者、GPU或对战性能测试。待阶段执行：

```powershell
python watcher/war3/tests/generate-harvest-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
cd watcher/war3
./build/windows-x86/bin/Release/war3_harvest_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/economy/fixture.w3m'
```

专项检查人族携金/返还、停止后保留负载、有限矿最后一包和耗尽、亡灵/精灵直接收入、暂停和矿移除。容量满载、兽族完整输入、事件重入、资源速率/人口税费、真实地形可达性与三图完整对局继续在阶段队列中验证。
