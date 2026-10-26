# 商店与单位训练

2026-10-27。新增能力连接到同一个原生会话、1/32秒模拟、JASS事件和游戏命令面板。完整四族经济、科技、英雄及战斗仍在实现，以下记录表示已接入代码。

## 实际流程

- 单位创建时，从源Profile读取Trains、Sellunits、Sellitems；从UnitBalance和ItemData读取价格、人口、训练时长、库存上限、初始延迟和补货间隔。w3u/w3t继续通过现有元数据覆盖解析。
- 库存native维护每个商店和后续新商店的全局覆盖；0/0条目保留为空库存。模拟时间推进补货，不写解包文件。
- 购买验证靠近的本方买家、携带栏、库存、资源、科技前置、类型上限和人口；扣资源/库存后创建真实单位或交付真实物品，提供买卖上下文并发送售卖事件。出生点检查源WPM和现存单位碰撞，找不到位置时拒绝购买或等待训练出口。
- 训练入口与IssueImmediateOrder/ById共用队列，最多7项；入队扣除资源，队首有足够人口后预留并开始，模拟完成后创建单位，消费集结点，再发完成事件。取消释放预留并退还该项资源；死亡/移除释放队列预留。
- 创建、死亡、移除、基础复活、转让及SetUnitUseFood更新玩家人口状态。队首预留交给完成单位，防止重复计数；状态更新先于回调，队列完成先移除旧项，允许脚本重入。
- 游戏命令区使用源产品图标、位置、热键、价格、库存及禁用原因；生产进度与队列可点击取消。建筑右键地面设置集结点。所需产品图标沿用后台内存读取和主线程GPU交付。
- GetObjectName读取已支持的单位、物品和能力名称，保留地图字符串解析；未支持类型明确失败。能力字符串表随源能力配置一起读取。

主要实现为 `src/session_commerce.cpp`、`src/session_production.cpp`、`src/session_food.cpp` 和 `src/game_commands.cpp`。没有添加成功占位native。

## 验证与待测

必要Win32 Release产品及新增消费者程序编译通过，无编译警告。DotA开局阻塞已越过AddUnitToStock、GetObjectName，当前到 `Scripts/war3map.j:8416` 的SetPlayerHandicapXP；main仍未完成。这是最小阻塞定位，不代表DotA可玩。

`war3_commerce_tests` 和 `tests/generate-commerce-fixture.py` 已编译/准备，按集中实现节奏排入阶段验证，尚未执行。夹具复制BootyBay地形，使用独立脚本检查售卖上下文/库存/携带栏、训练/取消/退款/完成、人口生命周期、转让和集结点。生成物只写仓库tmp目录。

集中验证入口：

```powershell
python tests/generate-commerce-fixture.py --data-root "E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne"
cmake --build --preset release --target war3 war3_commerce_tests --parallel 8
build/windows-x86/bin/Release/war3_commerce_tests.exe "E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne" ../../tmp/docs-artifacts/war3/commerce-fixture.w3m
```

源数据价格/字段已读取，但完整原件库存/退款/事件次序、人口天花板默认值、所有前置条件和商店选择规则尚未验收。英雄雇佣额度、物品使用/出售、建筑施工、科技研发、完整动态碰撞与英雄经验另行接续。队列数值及命令区排版需要集中对照原版；新增GPU界面未实测，旧画面证据不覆盖本次变更。

证据：`tmp/docs-artifacts/war3/commerce-{build.log,dota.log}`。阶段队列保持开放，未运行全套回归、三图完整玩法、性能基准或原件逐位对照。
