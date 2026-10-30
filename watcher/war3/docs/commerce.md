# 商店与单位训练

2026-10-27。新增能力连接到同一个原生会话、1/32秒模拟、JASS事件和游戏命令面板。完整四族经济、科技、英雄及战斗仍在实现，以下记录表示已接入代码。

## 实际流程

- 单位创建时，从源Profile读取Trains、Sellunits、Sellitems；从UnitBalance和ItemData读取价格、人口、训练时长、库存上限、初始延迟和补货间隔。w3u/w3t继续通过现有元数据覆盖解析。
- 库存native维护每个商店和后续新商店的全局覆盖；0/0条目保留为空库存。模拟时间推进补货，不写解包文件。
- 购买验证买家、携带栏、库存、资源、科技前置、类型上限和人口；玩家自有且带出售单位能力、无中立交互能力的商店可直接出售单位，未找到其他买家时出售事件的买家为空。物品及中立交互商店仍要求靠近的本方买家。扣资源/库存后创建真实单位或交付真实物品，提供买卖上下文并发送售卖事件。出生点检查源WPM和现存单位碰撞，找不到位置时拒绝购买或等待训练出口。

DotA `-sd` 模式创建玩家拥有的 `ncop` 商店，源能力包含 `Asud` 而不含 `Aneu`，脚本给商店添加英雄库存并选中商店。按钮和实际交易共用上述资格规则；附近买家优先及空买家事件是当前实现，真实选英雄操作、原版精度和多人行为待阶段验证。
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

四族商店买家范围读取 `Aall` 激活范围，中立商店读取 `Aneu` 及其派生能力，地图覆盖使用同一能力等级字段；没有交互能力的脚本自定义商店保留 450 距离回退。命令按钮、物品交易、单位交易及酒馆／显形建筑的买家检查复用该范围。当前以商店与买家中心距离判断，能力禁用、多个交互能力、碰撞半径与选择买家规则需与原版对照。

固定版 `War3Patch.mpq` 的 `Units/AbilityData.slk` SHA-256 为 `ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec`：`Aall/DataA1=600`、`Aneu/DataA1=450`；`Units/AbilityMetaData.slk` 的 `Neu1` 对应 DataA，`UI/WorldEditStrings.txt` 将其标记为激活范围。Win32 Release 客户端与测试目标编译通过；`war3_passive_tests <data-root> <fixture> shop-range` 7/7，覆盖四族、中立商店和酒馆的边界、实际交易及自定义范围。原版实际窗口与完整交互仍待验证。

商店读取 `Aall`／`Aneu` 的选择按钮显示开关、位置、图标和热键：点击按钮后选择附近己方单位，或选中商店后右键附近己方单位；商品按钮按当前买家判断，购买命令携带该单位，满物品栏或交易前买家失效时不会把该次购买转交其他单位。未手动选定时使用现有自动买家；买家离开可用范围后重新自动选择。商店物品栏显示当前买家的物品、冷却及提示，使用、目标选择、数字键和拖拽命令连接当前买家；发出时及联机消费时检查买家与商店的有效关系。实验联机和同构建回放使用带买家对象的 `0xfd` 购买动作；无指定买家继续使用原 `0xf4`。

Win32 Release 客户端、`war3_passive_tests` 和 `war3_revival_tests` 编译通过；`shop-buyer`、`lan-purchase-buyer`、既有 `lan-purchase` 和 `awaken` 各 1/1，`shop-range` 7/7。隔离会话覆盖两名英雄、指定买家、满物品栏、越界／移除、动作编码和交易消费；没有启动真实双端或验证原版协议。实际窗口、按钮位置／热键、买家指示与物品栏、选取／取消、目标类型、共享控制、买家自动切换、事件和时序需阶段对照；完整原版联机与商店物品操作未完成。

商店物品操作的实验联机和同构建回放使用带商店身份的 `0xfe` 动作，普通单位物品动作继续使用 `0xf7`。命令消费前重新检查商店选择、买家范围、物品持有和控制权限；已接受的排队物品命令由买家继续执行。Win32 Release 客户端和复活测试程序编译通过；`lan-shop-inventory` 1/1 在隔离会话中验证换格、离开范围及取消商店选择后的旧命令、普通动作编码与执行，不加载 Game.dll。实际窗口的使用、目标选择、拖拽、快捷键，以及双客户端、回放和原版行为仍待阶段验证。

英雄将物品拖到有 `Apit` 能力的商店时，复用物品交付订单行进并在范围内出售。检查物品可出售标志、持有关系、控制权限和商店可见／存活状态；交易使用物品源金币／木材价格及 `PawnItemRate`，支付后发送单位／玩家出售物品事件并清理真实物品与装备效果。出售过程中检查目标与物品失效，并限制同一物品事件重入。`Units/MiscGame.txt` 的固定版源值为 `PawnItemRange=300`、`PawnItemRate=0.50`，提取文件 SHA-256 `2228cf869991d6ec5133e6115c3457903c2f0da9f0d70acc3d2518fe91e5f5bf`；四族商店及地精商人原单位能力表包含 `Apit`。Win32 Release 编译与隔离会话 `pawn-item` 1/1 通过，覆盖权限、价格、事件字段和途中物品失效。移动到达、共享控制、队列、回调重入、边界和舍入、原版事件／出售显示及实际窗口／双端仍待阶段验证。
