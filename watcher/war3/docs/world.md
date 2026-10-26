# 原生世界与地图主函数

固定对照为 Warcraft III 1.27.0.52240。`World` 拥有原地图 W3I/W3E/WPM 的空间和路径数据；读取公共 MPQ、地图与配置只使用内存。地形/路径记录在卸载归档后仍由会话持有，切图随会话释放。地形渲染、碰撞、单位、AI与对局尚未接入，客户端总目标保持完整玩法和原版UI。

## 初始化和空间状态

后台选图和产品配置检查在执行globals/config前建立世界，因此全局初始化可创建需要世界边界的矩形。世界由源地形原点、角点维度和128单位网格确定，完整边界包含不可玩边缘；W3I相机角点和完整地形范围分别保留。`UI\MiscData.txt` 的CameraMargins读取公共/地图覆盖，`war3mapMisc.txt` 继续覆盖同名配置。默认源值left/right为4格、top/bottom为2格，对应512/256单位。

21个native已保存实际会话状态：Location/MoveLocation/RemoveLocation/GetLocationX/Y，Rect/RectFromLoc/SetRect/SetRectFromLoc/RemoveRect及6个边界/中心查询，GetWorldBounds、GetCameraMargin、SetCameraBounds、SetDayNightModels、SetWaterBaseColor。位置保留原始坐标；矩形先限制端点，再归整最小/最大值。GetWorldBounds每次创建独立可变矩形，使用完整地形边界。GetLocationZ、区域、MoveRectTo、天气和声音native仍未绑定，调用会报告源位置。

原版矩形点限制 helper `0x6f02f150` 读取地形范围，最大X/Y减32，最小边界不缩进；32来自静态初始化入口 `0x6f001c20`。矩形中心按原数值层先相加再乘0.5。GetCameraMargin入口 `0x6f1e1a20` 读取CameraMargins整数，尾部 `0x6f1e1a5a` 使用SSE整数转float并乘128；这里采用与该指令一致的舍入。越界side按原版返回0。SetWaterBaseColor入口 `0x6f1f7d60` 保留每个整数低8位。

相机四角、昼夜模型成员名和RGBA水色写入`WorldEnvironment`，变化标记供后续渲染器消费；当前尚未产生地图画面、灯光或水面效果。地图的默认水色由W3I的BGRA源记录转换。非有限坐标、无效/已销毁句柄会显式失败，这些异常边界及原版对象重用/引用计数尚未逐项还原。

## 主函数生命周期

`ScriptSession` 必须在初始化前挂接世界，执行globals/config并应用玩家草稿后才能 `startMain()`。main只能尝试一次；成功返回才记录`mainCompleted=true`。失败会保留世界状态供诊断并使会话失效，不能重试config/main或继续编辑草稿。产品必须丢弃失效会话。菜单开始游戏仍未接通。

`--main-check --map <路径>` 在同一个独立EXE内执行上述流程，不创建图形设备。任一未绑定native或脚本错误均以非零退出，并记录失败源位置、空间对象数及已更新的相机/环境状态；未完成main不会输出通过。这个入口用于推进真实原图初始化，不代表地图能够对战。

```powershell
# watcher/war3
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/FrozenThrone/(2)Amazonia.w3x" --hidden --main-check --log "../../tmp/docs-artifacts/war3/world/main-amazonia.log"
./build/windows-x86/bin/Release/war3_world_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/world/world-clamp-native.json"
# 仓库根目录
python watcher/war3/tools/verify_world_cpu.py
```

## 验证和来源

7项定向检查通过：空间边界/夹取、CameraMargins转换、全局位置与销毁、矩形操作/独立世界边界、main成功的状态传递与阶段限制、main失败终止、原图归档卸载后的数据所有权。Unicorn执行固定原件helper和相机换算指令，195组坐标点与77个源整数共272次逐位一致，无替换函数、不加载Game.dll。矩形中心复用已验证的JASS Real四则；该CPU检查不证明整个原版世界或native生命周期一致。

Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。原件注册、边界/夹取/初始化/颜色等REA证据在 `tmp/docs-artifacts/war3/world/world-*-rea.json`。夹具与报告为 `world-{clamp-native,margin-native,cpu}.json`，源码按LF归一化记录摘要；日志为 `build.log`、`product-build.log`、`tests.log`、`cpu.log`。原始脚本和配置仅供本地分析，不提交原版资源。

Amazonia最小产品执行已进入原图main，97×97角点与路径数据由世界持有；相机、昼夜模型、水色已写入，生成1个矩形，随后在 `war3map.j:1258:14` 的AddWeatherEffect明确失败、退出1，无Game.dll。证据为 `main-amazonia.log`。天气、声音、单位、InitBlizzard、触发器和胜负流程继续实现，不以这次部分初始化替代完整客户端验收。
