# 原版血法师与凤凰素材、头像相机和来源规则

Author: MiYu

本阶段交付血法师 Hblm、凤凰 hphx、凤凰蛋 hpxe 的原版素材与来源规则，作为游戏接入基础。当前对局尚未接入血法师四技能；单机、联机、地图编辑器、经典 TD 与 Dota 及完整 Warcraft III 复刻仍未全部完成，整体目标保持 active。

`scripts/import-frost-blood-mage.py` 复用现有几何、节点、头像和特效转换器，产生 580 个签名输出。包含 12 组几何绑定、14 个独立原始特效和血法师／凤凰两组内嵌粒子，全部保留来源哈希与转换凭据。无几何的放逐和吸魔效果使用真实粒子采样，不创建替代模型。asset-library 保持只读。

主体包括 HeroBloodElf、Phoenix；头像包括 HeroBloodElf_Portrait、Phoenix_Portrait、PhoenixEgg_Portrait。hpxe 的源 unitUI 与 hphx 指向同一个 Phoenix 主体模型，蛋形态保留其 Stand Alternate 动画；独立 PhoenixEgg_Portrait 仅用于头像。模型缩放及选择圈系数分别保存在每个源单位记录中，未统一为相同大小。英雄的 Asph 与 BloodElfBall 数据已保留，球体附着行为仍待游戏接入。

AHfs、AHbn、AHdr 只导入三个有效等级，AHpx 只导入一个有效等级。Hblm 的一级属性由源基础值与 Misc 属性公式得到 550 生命、285 魔法与 2.2 护甲，不能重复叠加 realHP/realM。AHdr 的 DataH 对应 manaBonusFactor，DataI 对应 manaBonusDecay；DrainUsesEtheralBonus=0 保留原值。源 AHdr 引用的 Bdbb/Bdbl/Bdbm 在 HumanAbilityFunc 中有图标定义，在 AbilityBuffData 中没有行，记录 sourceRow=null 并保留原始定义，不制造 SLK 行。ACmi、ACrk 的名称、文案和被动图标从 NeutralAbilityStrings/NeutralAbilityFunc 读取。

导入预检先解析原始表格、有效等级、UTF-8 BOM 后的首段名称、所有命令图标和 256×64 雷电贴图，检查已有输出的覆盖边界，再转换几何与采样特效。BLP 解码保留源尺寸、JPEG BGRA 通道和 alpha。带 BOM 的 Hblm 首段不能作为不存在的段落处理。共享转换器未修改，其既有凭据哈希保持有效。相同源文件只读取一次。

验证记录见 `blood-mage-assets-validation.json`。纯 Node 来源测试检查 580 个文件的字节、SHA-256、来源与生成器哈希、材质／特效／图标引用及有效规则。原生 pose reader 检查 810 个真实姿态，覆盖所有几何片段的起点、中点和终点。Python 两项测试验证 BOM 名称及已有源文件覆盖保护，保护测试确认在转换前失败且不写入其他文件。独立输出目录 `E:/work/codex/cache/mengine/blood-mage-source-rebuild` 的全部文件和凭据逐字节一致。来源测试已接入 `test-frostbound.mjs`，本阶段未重跑未受影响的全玩法／TCP 回归。

原生渲染采用现有 Release 程序，无原生重编译。隔离陈列图为 `blood-mage-source-assets.png`；实际源头像相机图为 `blood-mage-source-portrait.png`、`phoenix-source-portrait.png` 与 `phoenix-egg-source-portrait.png`。源头像 Transform 按 f32 精度断言，控制台错误与材质管线拒绝均为零，自有实例退出 0，运行目录、发现文件、隔离工程和存储均已清理。验收生成脚本先在 VM 中校验组件命令与四种相机模式，所有组件命令使用引擎的 setComponent 操作；真实原生相机位置另行验证。

凤凰头像的 TeamGlow geoset 2 是源背景板。统一陈列相机下会看到其侧面矩形；完整源相机下它覆盖为蓝黑背景。`phoenix-portrait-without-teamglow-diagnostic.png` 仅用于对照，隐藏该平面后头像轮廓相同、背景变为清屏灰色。正式资产保留全部源几何与纹理。主代理与独立只读审核均检查了这组图；未将零控制台错误当作画面正确的充分证明。

计时仅覆盖此次已记录步骤：最终导入预检约 0.4 秒，完整转换 8.495 秒；原生命令累计 10.187 秒，明细保存在 native-blood-mage-assets-qa.json，不能与历史大型场景验收直接比较加速比例。此前相机诊断产生的隔离工程保留在 QA 根目录，相关进程均已正常退出，无活跃句柄需要等待。

下一阶段接入人族血法师的原始属性、命令卡、火焰打击、放逐、魔法汲取和凤凰：需要有明确施法／持续／中断状态、吸魔与友军输魔、凤凰失血／死亡／蛋／重生、原始模型特效及严格存档和真实 TCP 同步。火焰主火／余火边界、建筑与伤害上限字段、魔法溢出上限／衰减、放逐伤害例外、凤凰自动攻击与重生细节仍需原版执行验证。本阶段未验证物理键鼠、音频听感、跨机器 LAN 或原游戏执行完全一致性。
