# 原模型粒子与特效实例

独立客户端已接入MDX800 PRE2解析/绘制、附件节点、脚本特效句柄及法术特效的场景消费。产品和专项消费者已编译；三份源模型CPU导入检查通过，GPU画面、真实操作、还原度和性能保持待阶段验证。

## 实际消费

- PRE2保存源速度/变化/纬度/重力/寿命/发射率/宽长、头尾、颜色/透明度/尺寸分段、纹理图集区间、过滤、优先级及KP2动画轨。纯PRE2模型进入同一资产加载/纹理上传路径。
- 粒子按实例保存发射余量、squirt关键帧、随机状态、位置/速度及剩余寿命；场景中的单位、物品、装饰物、攻击弹道、法术弹道/波形和独立特效共用模型/纹理，分别保存粒子状态。
- D3D9消费头/尾四边形、模型空间、线发射、XYQuad、远近排序、分段颜色/尺寸/透明度、图集区间/重复和五种源过滤模式。视觉随机不进入游戏模拟随机数。
- ATCH保存名字/ID/可见性及源节点变换，挂点按目标当前动画/世界变换求值；origin使用模型原点，未找到的其他挂点记录明确诊断。附件 Path 指定的子模型由场景资产递归读取并进入模型通用绘制，节点姿态、可见性、独立粒子状态和队伍色随父实例传递；载入界面、主菜单、战役背景及模型过场也复用此资源路径；游戏单位、特效、装饰物及界面模型的子模型声音递归接入，离屏后首次显示的子动画时钟仍待实现。
- AddSpecialEffect、AddSpecialEffectLoc、AddSpecialEffectTarget、DestroyEffect提供实际effect句柄、模型/位置或widget挂接、销毁状态及typed hashtable。句柄销毁后，场景保留Death动画或现有粒子排空所需的状态，再清理实例。
- GetAbilityEffect／GetAbilitySound 按技能 ID 查询源配置及地图覆盖；AddSpellEffect 的坐标、地点和目标形式按技能配置创建场景特效，沿用 effect 句柄及销毁生命周期。特效索引越界取最后一项，未知类型使用默认字段；地点或目标无效时返回空句柄。配置、空字符串和地图实际运行待阶段验证。
- 法术CasterArt、TargetArt、EffectArt和状态buff的TargetArt进入同一源模型消费者；状态刷新保留实例，驱散/到期/死亡释放状态视觉。已实现技能的MissileArt/弧度与波形模型连接实时位置、方向、源出生高度/命中高度及独立时间。
- 选中英雄的技能特效模型、实际生效模型和纹理通过现有后台读取/分帧上传队列准备。原资源只读，内存直接读取；没有新增解包或转换目录。

模型共享和实例状态分别保存；可见实例退出后释放GameView粒子状态，放置物状态随场景释放。单模型实例最多16,384条头/尾粒子记录，活动effect最多8,192个；长帧补发最多覆盖0.25秒，已有粒子按实际流逝时间更新。质量档位倍率、离屏重入与原版发射精度仍需阶段对照。

## 来源与维护

格式、发射、粒子和图集参考[flowtsohg/mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer)，固定提交`2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。具体文件和SHA256登记在仓库根目录third_party/warcraft-model-reference/source-info.json，MIT版权许可保留在同目录LICENSE-mdx-m3-viewer.txt。新C++代码不调用上游JavaScript运行时。更新时固定新提交、核对对应记录/发射/图集语义、保留许可、更新摘要并执行受影响的阶段验证。

当前使用本机1.27.0.52240原MPQ/地图中的模型和纹理。原始参考文件、22个相关效果模型的结构盘点、构建及最小导入记录均保存在tmp/docs-artifacts/war3/effects/，不纳入版本。

技能特效查询依据固定版 Game.dll（SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`）入口 `0x6f1e15d0`、类型分派 `0x6f1e1520` 及创建入口 `0x6f1da2f0`。原件空数组返回 null；源配置中的显式空文本是否生成非 null 空字符串仍待对照。字符串入口当前只识别四字节 ID；原件通过会话字符串表查找，表的来源、有效键和映射仍待确认及实现。

## 验证与剩余范围

必要Win32 Release产品、war3_spell_tests和war3_effects_tests编译通过，无编译诊断；四个新增native签名与原common.j一致。为确认纯粒子解析能进入消费者，只执行三份源模型的CPU导入：

| 源模型 | PRE2数量 | 最大粒子寿命 | 结果 |
| --- | ---: | ---: | --- |
| CarrionSwarmDamage | 1 | 0.2秒 | 纯PRE2导入通过 |
| FlameStrikeTarget | 2 | 3秒 | 纯PRE2导入通过 |
| HolyBoltSpecialArt | 3 | 1秒 | 几何与PRE2导入通过 |

此检查未创建图形设备，没有Game.dll；不作为GPU/视觉通过证据。命令为`build/windows-x86/bin/Release/war3_effects_tests.exe <data-root> <log>`，日志必须指向tmp/docs-artifacts/war3/effects/。war3_spell_tests增加effect实际状态、typed storage、销毁/退休断言，尚未执行。

阶段合并验证17种技能/状态特效、单模型多单位隔离、挂点/动画/可见性/缩放、出生/循环/死亡/立即DestroyEffect、squirt/图集/过滤/排序、冷加载首次施法、视野/离屏重入、暂停与长帧、三图持续切图、资源/CPU/GPU预算。[RIBB和源闪电](ribbons-lightning.md)已接入；PREM模型发射器、事件型SPN/SPL、完整灯光/环境雾、其他替换纹理、全部特效native与声音仍需实现；源发射数、粒子轨迹/尺寸/颜色和销毁语义的原版精度也未验收。完整客户端目标保持未完成。
