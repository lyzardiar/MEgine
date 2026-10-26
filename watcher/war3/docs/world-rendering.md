# 原地图到操作界面

本阶段把同一配置会话的main、源地形/放置数据、模型、相机、输入和返回选图连接到独立war3.exe。实现与原版一致性验收分别记录，完整客户端目标仍以acceptance.md为准。

## 资源与线程

MapBrowser启用Skirmish.fdf的PlayGameButton，转移已配置的ScriptSession。GameLoading工作线程执行main，准备SceneAssets、TerrainScene、SceneObjects和控制台；取消使当前请求失效，后续检查点终止CPU工作，新请求只保留最新一份。JASS main依靠VM指令预算终止，取消目前不在每条VM指令内抢占。取消/退出后重建配置会话。

CPU阶段显示工作阶段；GPU阶段显示实际纹理/区块上传完成数。窗口线程每帧以4ms为预算提交完整资源，单次纹理上传仍可能超过预算。资源齐备后进入GameView。失败记录具体错误，界面允许返回选图，隐藏开发运行非零退出。载入直接消费原Loading.fdf、多人载入MDX、LoadBar及自定义载入model。

SceneAssets每图共享CPU图像、GPU纹理和模型；归档视图复用既有公共/地图缓存。图像限256MiB、模型限2048；地形网格另限256MiB、8192区块。静态GPU缓冲在D3D9用managed pool、D3D9Ex用default pool。退出释放场景所有权；持续切图/设备恢复和公共解码资源跨图复用仍需阶段验证及后续完善。

## 源地形和实例

TerrainScene/terrain_layout复用已有 `crates/mengine-assets/src/warcraft_terrain/{mod,layout,surface,water}.rs` 的格式和拓扑规则，运行不依赖Rust：

- 四角按SW/NW/NE/SE组织，从Terrain.slk读取地面BLP，按mask/variation组合64像素图块，去重生成内存atlas。
- CliffTypes.slk提供悬崖/坡道MDX、地面与replacement11纹理；模板按footprint放置并叠加地形起伏，坡口保留半层高度。
- Water.slk提供水位、序列、贴图比例及浅/深颜色，按模拟时间选择原BLP帧；SetWaterBaseColor实际乘入水色。
- 16×16单元区块按材质合并静态顶点/索引缓冲，每帧视锥裁剪；地形光照、阴影、天气粒子和LOD待实现；基础迷雾与运行中状态见live-world.md。

SceneObjects直接读取classic DOO 7/8及terrain doodad，消费Doodads.slk、DestructableData.slk和元数据映射的w3d/w3b覆盖；保留模型变体、变换、显隐/死亡与replacement纹理。源pathTex的`none`表示没有路径贴图，其余有效贴图按红通道登记静态阻挡。实例按2048世界单位分区并裁剪。完整destructable句柄、采集/死亡/掉落、颜色变体、全部路径贴图变换和桥面寻路待补齐。

Model支持外部world/view/projection、静态模板采样、队伍色/发光替换和Stand/Walk/Death选择；相同模型/时刻/序列复用骨骼采样，billboard逐实例计算。main完成后预载单位/物品模型；运行中未准备模型进入后台读取/GPU交付队列，资源错误明确失败，边界见live-world.md。MDL、灯光、粒子和完整节点规则仍未完成。

## 相机、输入和HUD

相机读取UI/MiscData.txt及地图覆盖的六档Distance/AOA/FOV、Rotation、NearZ/FarZ和CameraRates，滚轮夹取预设范围。投影沿用 `scripts/warcraft_camera.py` 已分析规则：源FOV除以 `sqrt(1+aspect²)` 得到垂直FOV，逻辑视口0.8×0.45，顶/底留白0.02/0.13。Game.dll摘要和REA入口保留在该脚本，本阶段没有重复逐函数分析。初始位置使用脚本cameraTarget或本地出生点，平移在源边界内夹取。

左键、框选和Shift选择最多12单位，派发真实选择事件，源SelectionCircle贴图提供地表反馈。右键地面、M后点地面、S/H及命令图标使用同一会话函数。WPM八邻A*避免对角穿角，检查单位半径与静态阻挡，压缩可直达路径，最多搜索131072节点；单位按1/32秒、速度与路径推进，更新朝向、当前命令和动画。命令事件可读订单ID和目标坐标。

动态单位/建筑阻挡、局部避让、编队、攻击、巡逻、采集、建造和完整移动类型尚未实现。未知命令或找不到路径返回失败；选择/命令事件的原版时序和数值仍待验证。

ConsoleUI.fdf的九片原纹理按源UV/锚点及本地种族载入；资源栏读取玩家状态，选择面板使用单位属性/源图标，小地图使用地图自身BLP。基础物品栏和脚本文字已接入；完整信息面板、肖像、资源/人口规则、技能命令卡、计时窗口、源游戏内菜单与像素还原待完成。当前Esc/F10直接返回选图。

## 开发证据和待测

BootyBay最小开局显示真实地图：main创建65单位，载入2011放置物、177地形区块和192张纹理，CPU准备1156ms。原生窗口开发输入复现运行30游戏帧，选中1单位、接受1条移动命令、接收滚轮输入、返回选图并退出0，无Game.dll；首帧可见6区块、202放置物和7单位。它不验证移动终点、碰撞、全部缩放边界或完整性能。

证据为 `tmp/docs-artifacts/war3/scene-{build.log,input.ps1,input.log}`，地图画面参考为本地 `scene-bootybay.png`，不提交截图。完整选图/取消/失败恢复、相机限值、选择/订单、三图、持续运行、设备恢复、释放与性能进入testing-batches.md的W028–W030合并验证；未运行全套测试或旧引擎回归。
