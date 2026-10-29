# 攻城单位攻击地面

有启用 artillery／aline 武器的单位显示原 CmdAttackGround 图标和 G 热键。选择场景或小地图中的位置后，玩家发出 attackground（851984）点命令；地图脚本通过 IssuePointOrder／ById 及 location 形式共用该路径。单位不在射程内时会接近或退出最小射程，进入射程后按武器前摇、冷却、攻速和骰子持续发射，直到停止或接受新命令。已发射弹道沿固定目标位置飞行，落点由现有范围／直线武器流程处理单位、障碍及满足目标分类的地面物品；燃烧之油等已有攻城被动通过既有弹道消费者处理。

可向战争迷雾或未探索区域下令，不依赖目标单位可见性。订单进入现有 Shift 队列；实验局域网通过 0x11 点命令传输订单和坐标，由时间片重放，战斗摘要包含目标坐标。尚未验证双端同步或原版互通。

原 1.27 Units/CommandFunc.txt 中 CmdAttackGround 使用 CommandAttackGround、按钮位置 3,1，Units/CommandStrings.txt 定义 G 热键及持续射击提示；源 UnitWeapons 中迫击炮、投石车和绞肉车为 artillery，刃车为 aline。当前支持这两种武器类型；原版其他类型的资格、最小射程、路径阻挡、友伤、动画、燃烧油、落点高度、碰撞和延迟行为尚待对照。实际窗口、小地图、脚本事件重入、中止／继续、Shift 队列、迷雾和实验双端均待集中验证。

源查询脚本位于仓库根目录 tmp/docs-artifacts/war3/inspect-attackground.py 和 inspect-line-weapons.py；原资源只读，客户端不加载 Game.dll。
