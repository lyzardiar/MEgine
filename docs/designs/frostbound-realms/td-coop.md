# 合作塔防：蜿蜒守望

Author: MiYu

局域网菜单增加“合作塔防 [F4]”，加载随包 `Assets/Maps/td.json`。支持一人开始或两人共同防守：两名指挥官共享守方单位、金币、木材、视野和20点生命，协同建造、升级、出售防御塔，对抗12波进攻。任一玩家可操作共享单位；同一单位的新命令按服务器接收顺序生效。每次花费只在服务器固定步长中结算。

玩家席位 `seat` 与战斗队伍 `team` 分离：两席均控制守方 team0，team1 保留给进攻怪物。房主权限、准备状态、重连令牌与命令队列配额按席位/连接区分。每席每步最多12条待处理指令；重复序号被拒绝。对手的 `team`、单位ID等不能通过指令参数越权指定。

大厅显示共享控制规则。共享英雄由房主选择，选择变化清除准备状态；共享英雄和种族属于房间配置，房主迁移不会更改。掉线后15秒保留重连席位；恢复或过期回收都会重新检查在线房主并广播。尚有玩家留场时继续防守，不启用守方AI。两端收到相同的守方公开状态和胜负结果，在线客户端只呈现服务器状态。

协议升级到90，客户端、生成脚本和服务器必须一起更新；89版本握手会被拒绝。遭遇战和Dota保持分别控制team0/team1、独立英雄及离房AI接管。

## 验证

- `node scripts/test-frost-td-coop.mjs`：24项检查通过，覆盖真实TCP身份/权限、两人建塔、共享余额竞争、共同胜负、掉线恢复、房主迁移、遭遇战/Dota回归，以及生成客户端鼠标/F4入口和准备状态。
- 队列限额用真实连接对象的生产消息解析器同步接收13条命令，强制同一模拟步前入队，验证两席各自的配额。该子用例不经过TCP传输。
- 胜负边界、余额竞争和席位过期用例显式调整服务器测试状态，不代表完整12波实玩。
- `node scripts/qa-frost-native-authority.mjs --td`：两个独立Release V8 Player通过随包地图实测；330份完整客户端状态匹配服务器，1,064次共同可见单位比较通过。双方建塔、第一波出兵、断流不自行推进、真实TCP重连及重连首指令通过，两进程正常退出。
- 39个受协议升级影响及地图/场景相关脚本全部通过；权威状态、连接计时、生成客户端重连和独立构建输出检查通过。全量入口在精简工作树缺少 `Assets/BloodMage/Effects/Textures/remaining-ready/Abilities/Spells/Human/Banish/GenericGlow2bA.png` 时中止，不能据此声称全仓回归通过。
- 原生证据：`native-td-coop-validation.json`。这是同机双进程和脚本触发的操作验收；跨机器联机、物理输入和完整12波平衡性仍待验收。

原生复现需要完整资产工程：

```powershell
$env:MENGINE_RUNTIME_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-runtime.exe'
$env:MENGINE_QA_PROJECT_ROOT='D:/MEngineNativeQA/hero-death-validation/hero-death-1791680571419/sample'
$env:MENGINE_QA_ROOT='D:/MEngineNativeQA'
node scripts/qa-frost-native-authority.mjs --td
```

Player使用独立存档ID与资产目录链接，加载当前分支生成的脚本和场景。无需复制整套资源或重编译引擎。
