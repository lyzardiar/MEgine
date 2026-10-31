# 地形雾与计时窗口

地图 W3I 初始深度雾、SetTerrainFogEx 和 ResetTerrainFog 连接会话环境；重置读取 UI/MiscData.txt 的 TerrainZFog，世界绘制期间应用 D3D9 雾并恢复渲染状态，玩家视野遮罩保持独立。原版 1.27 的旧 SetTerrainFog 和 SetUnitFog 入口均直接返回，客户端保留相同脚本行为。雾类型映射、范围／颜色、表雾和真实场景合成仍需原版画面对照。

脚本计时窗口消费现有 timerdialog 和计时器状态，使用原版 TimerDialog.fdf 与种族底板、脚本标题／颜色，按 HH:MM:SS 显示；速度作为显示数值倍率并按原版公式取整，非正实时覆盖值清除覆盖。实时覆盖的递减时钟、暂停、时间上限、默认颜色和屏幕布局仍待原版对照；计分板同时显示时使用独立位置。

Win32 Release 产品编译通过；会话定向检查雾参数／重置及计时倍率／覆盖清除通过，原 FDF 在隐藏窗口完成绘制，未加载 Game.dll。证据在 tmp/docs-artifacts/war3/terrain-handicap-timer-probe/ 和 timer-dialog-probe/。未验证完整 GameView 画面或实际游戏交互。
