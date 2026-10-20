# 人族塔升级入口

Author: MiYu

遭遇战启用原版人族建筑规则时，哨塔只提供防御塔、炮塔、奥术塔三条源升级分支。源塔不提供通用等级升级；共享命令入口拒绝 `towerUpgrade`，不会扣费或修改生命、攻击及等级。该校验同时适用于本地和服务器命令。

## 来源与复核

- 保留源件：`samples/frostbound-realms/SourceAssets/ArcaneTower/Units/HumanUnitFunc.txt`；现有 `human-masonry.json` 保存解析结果和绑定。`hwtw.Upgrade=hgtw,hctw,hatw`，`hgtw/hctw/hatw` 没有后续 Upgrade 项。
- REA 上游：[morluto/rea](https://github.com/morluto/rea)，固定版本 6.5.0、提交 `3b79af28e80785afce9f5998d8f03289402a1847`；安装和维护沿用 `third_party/rea/README-MENGINE.md`。
- 本机 `Game.dll` SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA `execute_rizin_command` 命令 `e scr.color=0;pd 7 @ 0x6f338b0f` 显示 Upgrade 与 UpgradesCount 共同传给 `0x6f3247f0`，输出位置为 `[esi+0x174]`。
- 静态证据 ID：`ev_75d144bb96e457b24492307cde9b85908ce60dc941b978b84b46de992209b26a`。命令完整结束，无截断，源文件执行前后摘要相同。原始结果位于 `tmp/docs-artifacts/frost-human-tower-upgrades/upgrade-loader-rea.json`。

字段读取是静态调用链证据；升级链的具体内容来自源表。本阶段未运行原版 Warcraft 进行逐帧 UI 对照。

## 兼容性与验证入口

复用 `masonrySource` 判断源人族塔，不增加存档字段或更改协议116。塔防、关闭原版人族建筑规则的旧模式以及兽族通用塔继续使用原等级升级。旧存档读取规则保持兼容；本次不迁移历史存档中的属性值。

```powershell
node scripts/test-frost-guard-tower.mjs
node scripts/test-frost-guard-tower-client.mjs
node scripts/test-frost-guard-tower-network.mjs
node scripts/test-frostbound.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-guard-tower.mjs
```

新增覆盖哨塔、通用人族塔别名、防御塔、炮塔、奥术塔的命令拒绝、属性和金币无变动及可保存性；生成客户端与原生脚本检查命令卡，同时实际点击塔防升级按钮并验证付款、等级和读档。TCP用例从客户端向真实服务器发送命令，验证服务器拒绝。

本阶段针对性玩法5组、生成客户端9组、真实TCP8组通过。原生14项检查通过，控制台错误0，专用编辑器正常退出；WebView缓存因EPERM保留在专用QA目录。生成文件、样例文件及原生测试副本的Main.js SHA-256均为 `486d13187623c974e34a211be36758234f5e4e280ad07c6e496a9c5934b2c6ba`。阶段证据位于 `tmp/docs-artifacts/frost-human-tower-upgrades/`。

完整主回归 `node scripts/test-frostbound.mjs` 退出码0，共766条PASS记录，包含24,000帧AI验证；日志为 `tmp/docs-artifacts/frost-human-tower-upgrades/regression.log`。
