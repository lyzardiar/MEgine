# 战役AI开局、采集与部队

StartCampaignAI继续从挂载归档读入地图策略，使用公共归档的原common.ai。CampaignAI所需SetSlowChopping已连接真实伐木，后续CampaignBasics和BuildLoop在共享模拟调度器运行。运行不加载Game.dll，不生成解包工程。

## 实际消费

- SetSlowChopping按玩家保存。非小精灵工人的一次慢速采集获得1木材、对树造成0.1伤害，携带上限与间隔继续读取源能力。关闭后恢复源DataA，资源经过真实携带、返还和税率消费。小精灵暂沿用源能力，完整四族语义待阶段对照。
- HarvestGold/Wood登记同镇累加配额，在下一AI心跳统一分工，同段ClearHarvestAI后的声明共同生效。保留符合配额的工作，再补足或转岗；下降配额释放多余工人，有携带资源时返还。先独立城镇，再以-1分配剩余工人。守卫/队长/施工/修理/施法和暂停单位不强制改派；矿内工人离矿后再分工。
- AddAssault/AddDefenders分配互斥的实际突击队和防守队。SetCaptainChanges控制后续自动补员，显式编组仍生效。死亡/转让/守卫及定时生命排除按状态更新；暂时暂停、眩晕和施法保留队籍。防守队参与CaptainInCombat(false)查询。
- SuicideUnit/Ex选已有同型战斗单位，解除队长/岗位保留，持续向实际敌军或指定敌方玩家出击；无敌人时保留分派并停止旧目标，死亡/转让清理分派。该入口不创建或杀死单位，非正数量不操作。
- TeleportCaptain移动突击队，按部队中心保留相对位置并裁到地图内，清理旧路线/工作/施法/命令，更新脚印和视野。守卫、防守队和单独出击单位不随队传送；新位置成为集结/目标点。

## 依据与开发检查

Game.dll SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a。REA/Rizin定位SetSlowChopping入口0x6f894a70及SetCaptainChanges入口0x6f8942a0，分别读写AI状态+0x2d0的0x40/0x80位；慢速查询0x6f8a1480的采集消费者选择0.1浮点常量和整数1。SuicideUnit/Ex共同进入0x6f8a1790，以数量、类型和目标玩家分派真实单位/命令；TeleportCaptain入口0x6f895390连接队伍操作。完整规则、编组优先级、落点、随机和时序仍需阶段对照，这些入口依据不代表完整原版精度证明。

必要Win32 Release产品及新增消费者编译通过。仅运行原CampaignAI开局最小检查：4秒时1城镇、2常驻线程、6名采集工人、2项生产队列，1项通过/0失败，无Game.dll。首次2秒断言未覆盖下一采集/生产心跳，消费者改为观察4秒，模拟时钟未改。armies/harvest模式已编译，尚未执行。

原始证据位于根tmp/docs-artifacts/war3/campaign-ai/：source-context.json、rea-evidence.json、fixture.w3m、build.log、build-final.log、delivery-build.log、startup.log、startup-final.log。夹具仅保存于本地临时目录；公共原AI从用户安装读取，安装目录只读。

~~~powershell
cmake --build --preset release --target war3 war3_campaign_ai_tests --parallel 8
python tests/generate-campaign-ai-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_campaign_ai_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/campaign-ai/fixture.w3m" startup
~~~

阶段合并本程序armies/harvest模式及既有AI/守卫/采集/战斗消费者，覆盖补员/编组开关、传送/落点、出击/目标失效、配额下降/跨镇/-1、返还、矿内/忙碌/死亡/所有权/回调重入、四族慢速采集。完整战役、运输/合并/变形、其余native、三图长局、GPU、性能和原版精度仍开放。
