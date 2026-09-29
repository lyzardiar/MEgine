# 写实攻城器械

四族攻城器械使用 Wildfire Games 的 0 A.D. 美术，固定版本 `61a3b9507d974084e6badb88a0826bd89a6d5b8b`，按 CC-BY-SA-3.0 署名并保留同许可。弩炮、扭力投石机、牵引投石机与冲车保留木材、绳索、金属纹理和机械骨骼动画；三个远程器械各含装弹与发射两个模型，冲车保留移动撞锤，共七个模型。

模型通过共用导入器生成单材质 glTF 和 1024 像素 base/normal/ARM 图集。Collada 附件节点支持按文档顺序累积 matrix/translate/rotate/scale；装弹与空载模型按机身统一比例，弹药不影响整体缩放。机身旋转跟随目标方向，机械动作与模拟冷却时间同步，发射时移除挂接弹药，重装时恢复。训练按钮和选择头像使用实际引擎渲染的模型图集。

`siege-sources.json` 记录 95 个原始文件、固定下载地址、SHA256，以及 35 个派生文件的哈希。牵引投石机使用同来源的 artillery stone 和花岗岩贴图。弩炮两名、牵引投石机四名操作员保留人物骨骼、头盔、服装和同步工作动画；三种炮械移动时保持机械待机姿态，操作员播放行走动画，冲车使用原始移动动画。扭力投石机与冲车尚无可见操作员，手中弹药搬运尚未呈现。其余未替换角色仍有风格差异，整体美术统一尚未完成。

操作员使用独立骨骼名前缀，各自挂在机械附件节点上，头盔与工具跟随相应人物插槽。待机、行走使用能容纳人物完整动作的片段长度，攻击统一采样到机械的原始周期。导入器在临时 XML 内去除完全重复的骨架根节点并补齐动画材质的缺失字段；原始文件保持原样，不接受同 ID、不同内容的冲突节点。

## 重建与验证

```powershell
& tmp/blender/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/import-frost-humans.py -- --manifest siege-sources.json
python scripts/test-frost-siege-import.py
node scripts/render-frost-unit-icons.mjs --siege-sheet
node scripts/render-frost-unit-icons.mjs
node scripts/build-frostbound.mjs
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --siege-art-only
node scripts/qa-frostbound.mjs --tactics-only
```

导入检查覆盖有限坐标、合法索引、归一化骨骼权重、真实机械运动、装弹几何和 63 个原生姿态边界；另外检查 12 个操作员实例的头盔绑定、手臂动作、脚部形状与地面或木制平台接触高度。附加骨架先设置长度再设置完整矩阵，保留原始骨骼朝向；弓骨架也使用同一流程。全部 35 个攻城派生文件与 43 个人类角色派生文件均通过重复导入哈希一致检查。

实际 QuickJS/原生渲染验收通过 Agent 输入检查四种器械的选择、移动、攻击朝向、三个装填周期、四个选择头像、王国工坊训练图标、伤害及保存恢复。规则/TCP 测试另检查四族生产与模型映射。原生攻击验证使用平地、无 AI 和固定高生命靶，截图表示该测试场景。

- [原生姿态展示](siege-poses.png)：每行依次为弩炮、扭力投石机、牵引投石机、冲车。
- [弩炮战斗](siege-ballista-combat.png)、[投石机战斗](siege-catapult-combat.png)、[牵引投石机](siege-trebuchet-loaded.png)、[冲车](siege-ram-combat.png)。
- [导入验证](siege-import-qa.json)、[原生交互验证](native-siege-art-qa.json)、[阶段结果](siege-art-qa.json)。

未验收物理鼠标、音频听感、跨机器联机或独立 Player 帧率。
