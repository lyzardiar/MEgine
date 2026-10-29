# 脚本相机眼睛位置

`GetCameraEyePositionX`、`GetCameraEyePositionY`、`GetCameraEyePositionZ` 和 `GetCameraEyePositionLoc` 依据当前镜头中心、距离、俯仰、旋转及源震动计算眼睛位置；地点句柄包含眼睛的 XY 坐标，按普通 Location 生命周期释放。该几何与 GameView 绘制共用，镜头字段插值和旋转由现有会话时钟消费。DotA_v6.83d 的 `DD5` 使用 X/Y 测量镜头与单位的距离。

会话侧读取脚本镜头状态，单机 GameView 将用户缩放、移动和跟随结果写回该状态；无 GameView 时使用当前脚本镜头状态。源震动应用与绘制共用的相位公式，目标震动只改变朝向而不改变眼睛位置。会话侧高度取世界地形，GameView 的目标高度还考虑可见水面，因此水域上 Z 可能有差异；局域网 GameView 的用户镜头保存在本地副本，会话侧查询尚不能完全反映本地镜头。跟随／平滑的渲染帧与脚本运行顺序也需核对。原版坐标、震动、地形及本地客户端语义未对照。

阶段生成 `python tests/generate-game-flow-fixture.py --data-root <data-root>` 并运行 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`，随后在真实窗口对照旋转／缩放／平移与单位跟随、源／目标震动、过场、暂停、地形／水面、独立客户端和双端各自镜头；检查地点句柄释放、极限字段和镜头时序。完整原版行为与游戏画面仍待验收。
