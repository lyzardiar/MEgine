# 古树扎根与拔根

2026-10-28。Aroo原型的Aro1/Aro2已接入同一古树的扎根/拔根、路径占地、移动、武器、防御、生产和矿井生命周期。完整客户端与原版一致性仍未验收。

| 源定义 | 扎根状态 | 拔根状态 |
| --- | --- | --- |
| Aro1，生命之树及战争/知识/风之古树 | 武器1，建筑占地与生产，Alternate姿态 | 武器2，源40移速，取消静态占地，禁止生产/研究/升级和资源返还 |
| Aro2，远古守护者 | 武器2，源远程攻击与建筑占地 | 武器1，源近战攻击与移动 |
| 共同字段 | root=852165，2.5秒转换，按源开关决定是否转向 | unroot=852166，2.5秒转换，DataD=2使用large防御分类 |

古树保留原类型、句柄、归属、用户数据和已有属性。建筑分类与是否固定在地面分别消费：移动、追击、攻击移动/巡逻和普通命令区读取当前固定状态；生产/研究/升级、集结、资源返还和缠绕金矿仍受扎根状态约束。当前生产队列或缠绕施法未结束时不能拔根。新初始化的古树使用源扎根状态和对应武器、占地及Alternate姿态。

扎根按钮使用原Art/Unart、说明、热键和位置；拔根为即时订单，扎根切换为地面选点。选点复用建筑尺寸、64网格对齐及红绿路径网格/模型预览。施法先移动接近目标点，转换期间预留计数占地并锁定动作，完成前重新核对地形、其他单位和脚本移位；取消释放预留。拔根完成释放原建筑占地，生命周期沿用施法结束/取消事件和原单位。仅活动转换进入更新集合。

生命之树拔根时释放缠绕矿覆盖与父子关联，底层金矿恢复可用并保留剩余储量；移动中的古树不能继续缠绕矿井或作为资源返还站。护甲分类与实际武器选择进入伤害、目标合法性、自动索敌、命令和IsUnitType武器查询；已发射攻击保留其既有武器资格。

原MDX动画采用动作词与Alternate模式匹配，并缓存匹配结果。Stand Alternate可以选择远古守护者的Stand Walk Alternate；普通黑曜石雕像不再选中毁灭者的Stand Alternate。吞树动画的EatTree/Eat Tree源拼写可匹配。原模型没有交替版的建造动作时保留普通源动作回退。吞树玩法已接入，见[吞树与魔法吞噬](consumption.md)。

来源为本机Warcraft III 1.27.0.52240的AbilityData/AbilityMetaData、NightElfAbilityFunc/Strings、UnitBalance/Data/UI/Weapons/Abilities、NightElfUnitFunc、原WPM/路径纹理及MDX序列。源成员归档和SHA-256见本地source.json；Root的字段标签为扎根武器、拔根武器、扎根转向、拔根防御模式。既有REA证据观察到Game.dll的CAbilityRoot RTTI（0x6fb8fb6c），仅确认类存在，不证明完整行为。产品不加载Game.dll，原安装保持只读。

必要Win32 Release产品/新消费者编译无诊断，差异检查通过。flow三组与models一组最终4通过/0失败、无Game.dll，覆盖真实WPM移动/占地/取消、原按钮/目标模式/句柄/训练限制、守护者远近武器和防御伤害差异、缠绕矿释放/储量，以及三种原古树和黑曜石雕像的CPU动画选择。没有运行三图/旧全套/GPU/性能基准；CPU模型检查不代表实际画面验收。

```powershell
# cwd: G:/work/github/MEgine/watcher/war3
cmake --build --preset release --target war3 war3_roots_tests --parallel 8
python tests/generate-construction-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --output "../../tmp/docs-artifacts/war3/ancient-roots/fixture.w3m"
./build/windows-x86/bin/Release/war3_roots_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/ancient-roots/fixture.w3m"
./build/windows-x86/bin/Release/war3_roots_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/ancient-roots/fixture.w3m" models
```

阶段合并验证：全部古树/中立古树/w3a/武器和转向开关，原版建筑分类/碰撞/路线/高度与生产规则精度、多人抢位/路径缺失/边界/取消/暂停/死亡转让/能力增删/事件重入、矿内工人返还与完整经济/AI，源按钮/网格/模型变体/动作过渡/附件/音效/GPU及三图长局/CPU/内存/切图释放。吞树与毁灭者能力已接入对应队列，完整客户端继续实现。

原始证据：仓库根tmp/docs-artifacts/war3/ancient-roots/{source.json,source-rows.log,read-source.py,model-sequences.log,read-sequences.py,build.log,check-build.log,flow.log,models.log,model-import.log,fixture.w3m}；RTTI依据复用advanced-forms/rea-forms.json。原图、截图及诊断产物不提交。
