# DotA 黑皇杖与失效物品句柄

DotA_v6.83d 的黑皇杖 `I0FZ` 使用水元素原型触发地图脚本；脚本替换物品后，延迟回调仍读取原物品句柄。`GetItemPlayer` 对失效或不兼容物品返回空玩家，`GetItemCharges`、`GetItemUserData`、`GetItemLevel` 返回零，`GetItemType` 返回 `ITEM_TYPE_UNKNOWN`；有效物品继续读取实时状态。

固定版 Game.dll SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA/Rizin 证据 `ev_28898112e11ff11c91c2565a3e2d58625b0cd20a91e40bd86d7cc7803e994f08` 和 `ev_2fc01d05c067920a3405ccc884ff69ccd8d6ee3694461d0b04f490c62d377897` 显示上述入口在物品解析失败后返回相应默认值。

Win32 Release 客户端及测试程序编译通过；`invalid-item` 1/1 覆盖有效、空、销毁和不兼容句柄。原图静音隔离会话直接创建英雄及 `I0FZ` 并使用：物品替换为 `I0G0`，免疫在第 1 至第 10 秒采样为真、第 11 秒为假，替换物品保留冷却；日志为 `tmp/docs-artifacts/war3/dota-bkb/bkb-after.log`。探针未经过自然购买和游戏窗口，不证明完整对局或原版精度。

阶段验证多次使用和最低持续时间、物品转移／删除、其他来源免疫与驱散、事件和冷却、跨玩家／联机、原版表现及真实窗口。其他物品 native 的无效句柄行为尚需按各自原版入口核对。

`UnitAddItemById` 和 `UnitAddItemToSlotById` 对无效单位或物品类型返回空句柄／false；`SetItemPlayer`、`SetItemCharges`、`SetItemUserData` 对无效句柄直接返回，`SetItemPlayer` 也忽略无效玩家。固定版原入口和失败分支见 REA 证据 `ev_269b68347deb2288b958c3a20a119f85d1ad82a0b1fed12c51de15babe9255bc`、`ev_aa8303be2a8cc5232977f36bfcee2c3ced08b96e7922a2e1f9d0ac11fa5277b1`、`ev_d5d155b076fa94db39ace0ea4b21393de5dba0ccfe8de9326b2e42dd947f9327`；`invalid-item` 检查 1 通过、0 失败。物品创建位置、失败边界及完整事件仍待原版对照。

`UnitAddItem` 在单位或物品句柄为空、已移除或类型不兼容时返回 false；有效句柄沿用实际拾取、背包和事件流程。固定版 `Game.dll` 入口 `0x6f1fa610` 在两次对象解析失败后跳转到返回零的分支，REA 证据 `ev_83e6fe6aa3b0d88d794cf8c6cf34c2e9f3f5f61f3555373d15b334c579912717`、`ev_16709ff5920112af8f5f67b6740db3aa696660ff451a655114d1182f8bc8733b`。隔离夹具 `invalid-item` 1/1 通过，覆盖两类无效句柄及后续有效拾取；实际地图回调、事件重入和原版动态行为待阶段验证。

`GetItemX/Y` 对无效物品返回零，`GetItemName` 返回 JASS null；`SetItemPosition`、`SetItemVisible`、`SetItemInvulnerable`、`SetItemDroppable`、`SetItemPawnable`、`SetItemDropOnDeath` 对无效物品直接返回，有效物品继续读写真实状态。固定版入口及对象解析失败分支见 REA 证据 `ev_a918d4e4d4ea1d7da34ca30bfe94ba8c83554c047fa6fcf6858412b2429442ef`、`ev_4649c01b35c8c1a7cadeece799a4775c2098039d7cee07e33bc1921d9eed52ba`、`ev_e082ca96d7ff71437bc7725ec5e8d3e2fcbc775e96cc8df39a7aa0cbd88aa9d1`、`ev_720e8270046a58a0f0e6a652f3bcbea77a7e9036365cc6480b2a8ad4ae689861`。隔离夹具覆盖空、销毁和不兼容句柄，以及有效位置和标记切换；动态回调和原版运行行为仍待阶段验证。

持有物品的位置查询直接读取当前持有者坐标，单位由脚本即时移动后无需等待模拟步；丢弃后查询地面坐标。Win32 Release 客户端及 passive 目标编译通过，`invalid-item` 定向检查 1/1 通过，覆盖移动后立即查询和丢弃。固定版 `GetItemX/Y` 使用物品虚函数读取坐标，`CItem` 对应虚函数返回对象 `+0x64` 字段，静态证据 `ev_4649c01b35c8c1a7cadeece799a4775c2098039d7cee07e33bc1921d9eed52ba`、`ev_3dcc5d9c6460613c6f9e207de5a95a373ea94ff0b9dcc71c21f7b1adeee10952`、`ev_a8bfb73a5922be4c865de7025f6edc7d48f72b68724c72ecf571d730eb13ab4e` 和 `ev_72a213a45247b2b7b836ed4c1a2728b2adc4bc5b3d7576b4865be0e78b2da64b`；字段在持有期间的更新时机尚未确认，原版规则、单位移除／死亡／转移、重入及真实地图脚本仍待阶段对照。

物件通用坐标 `GetWidgetX/Y` 对持有中的物品与 `GetItemX/Y` 一样读取持有单位的实时位置；落地后读取物品自身坐标。固定版 1.27 两组入口在解析对象后均调用同一位置虚函数（槽位 `+0xb8`）并取对应坐标，静态记录 `tmp/docs-artifacts/war3/widget-item-position/native-assembly.txt`。原版物品位置更新时机与真实地图仍待动态对照。

附到物品的脚本特效在创建、状态更新及绘制时读取物品当前位置，物品被持有时跟随持有者；地面物品继续使用自身坐标。原模型附件点、空中高度、持有／隐藏时的原版可见性和实际窗口效果仍待验证。

物品特效由单位持有时沿用该单位对观察者的可见性，并使用持有者当前地表和飞行高度；地面物品特效仍使用地形高度和迷雾。原版物品附件点及隐身／空中表现需通过实际窗口对照。
