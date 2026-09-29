# 王国写实骑兵

王国骑士使用 Wildfire Games 的 0 A.D. 棕色 Lusitano 战马、马具、马鬃和尾巴，骑手沿用王国链甲、头盔、剑与盾。源版本固定为 `61a3b9507d974084e6badb88a0826bd89a6d5b8b`，原件及派生模型、纹理、材质和组合头像图集遵循 CC-BY-SA-3.0，署名随 Player 位于 `Assets/Licenses/0ad-cavalry.txt`。

`cavalry-sources.json` 记录 61 个源文件的下载 URL、字节数和 SHA256，以及 5 个派生文件。模型包含 3962 个三角形、188 根骨骼，马与骑手共享时间轴，提供 24 帧站立、8 帧奔跑、16 帧攻击动画，以 12 Hz 采样。骑手骨架附着到战马的 rider 节点，装备跟随人物插槽。马鬃与尾巴使用透明裁剪，盔甲、身体和玩家颜色区域保持实体表面。

骑士是王国二级兵营的第五种训练单位，花费 200 金、60 木、3 人口，训练 10 秒；AI 也会训练。移动、重甲、近战与禁止对空规则、集结点、训练队列和保存恢复使用现有模拟。联机协议为 10，旧协议客户端需同步更新。骑兵血条位于模型上方，按钮头像由实际模型渲染。圣骑士等其他单位继续使用各自模型。

## 重建与验证

```powershell
& tmp/blender/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/import-frost-humans.py -- --manifest cavalry-sources.json
python scripts/test-frost-cavalry-import.py
node scripts/render-frost-unit-icons.mjs --cavalry-sheet
node scripts/render-frost-unit-icons.mjs
node scripts/build-frostbound.mjs
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --cavalry-only
node scripts/qa-frostbound.mjs --network-only
```

导入验证检查全部源文件和派生哈希、有限坐标、合法索引、四个归一化蒙皮权重、人物装备几何、骑手手臂和战马腿部动作、透明贴图与 48 个原生姿态边界。重复导入得到完全相同的 5 个骑兵文件；共享导入器重新生成的 43 个人物文件、35 个攻城文件也与先前哈希一致。

规则/TCP 验证覆盖王国专属科技门槛、费用、AI、训练队列保存、移动、近战，以及训练中断线恢复和产出后的集结命令。原生 QuickJS/Agent 输入验证实际第五个兵营按钮产出第二名骑兵、选择头像、移动与攻击动画、朝向、伤害、保存恢复，材质管线拒绝数为 0。双客户端原生测试验证协议 10 与重连。

- [九个动作姿态](cavalry-poses.png)、[实际战斗](cavalry-combat.png)、[兵营训练](cavalry-training.png)。
- [导入检查](cavalry-import-qa.json)、[原生交互检查](native-cavalry-qa.json)、[阶段结果](cavalry-art-qa.json)。

截图为原生引擎渲染；战斗截图使用平地、固定高生命靶和无 AI 的专项测试场景。其余未替换角色仍存在风格差异，整体美术统一和完整游戏复刻尚未完成。Free3D 此前访问返回 HTTP 403，本阶段未从该站下载资源。物理键鼠、听感、跨机器 LAN 和独立 Player 帧率尚未验收。
