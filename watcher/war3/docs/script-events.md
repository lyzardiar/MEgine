# 原图初始化与脚本调度

会话新增玩家集合、组合条件、触发器动作/条件、事件和计时器窗口数据。过滤、枚举与嵌套执行使用上下文栈；回调中销毁对象后重新核对存活状态。单位死亡/所有者/选择、玩家联盟/状态写入已连接对应事件；计时器和昼夜阈值由会话步进驱动。未知native保持明确失败。

`ScriptSession::advance`采用当前实现的1/32秒固定步长；短于一步的计时器至少等待下一步，暂停期间丢弃外部经过时间。时刻直接赋值同样通知阈值事件。PLD预载脚本在独立、有指令预算的JASS中执行，只绑定归档读取，不生成文件；资源驻留预算64MiB，尾部空白/mdl别名已处理，缺失提示保留记录。

源单位能力表与AbilityFunc已连接能力等级、永久标志和自动施法开关。立即命令只接受已支持的停止/保持位置或匹配的自动施法开关，其余返回拒绝；施法、战斗、移动、库存、形态和完整能力覆盖待实现。相机中心、迷雾/游戏设置、科技/种族及计时器窗口状态已持有，等待地图画面/输入和完整规则消费。

源表新增兼容：保留无标题列，使用SYLK公式的缓存常量且不执行公式，能力表按alias索引，数字字段修剪源空白。声音标签从实际SoundInfo表枚举并保留已知文件回退。Miles采用库内waveOut输出：preference15=1、open_digital_driver flags1；格式44100Hz/16bit/stereo，仍使用固定原件DLL与codec。

## 最小开发复现

```powershell
# watcher/war3；GUI EXE用Start-Process -Wait -PassThru收取退出码
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/(2)BootyBay.w3m" --hidden --mute --main-check --simulate-ms 250
```

BootyBay原图globals/config/main退出0，无Game.dll：65单位、5位置、2矩形、42触发器、8计时器、57事件；15声音对象、3个真实Miles声音、1个DLS库，预载缺失0。推进250ms后，原Blizzard.j的MarkGameStarted使bj_gameStarted=true。此证据证明初始化和早期回调链路，不代替地图画面/可玩对局。

产品SHA-256 `035b4a2c02f786f355fa927481a21b49aa37c815c34e02a8a5aa71793c96bbe4`。产品编译无警告；165个字面量native签名与固定common.j静态一致。证据为 `tmp/docs-artifacts/war3/stage-a-{build.log,bootybay.log,crash.json,*-rea.json}`。构建目录的war3.map用于开发符号定位，不提交运行产物。

## 待实现与待阶段验证

- 开始游戏、载入、地图渲染/输入、HUD、计时器窗口显示、完整对象/能力/库存和AI仍需接线。
- TriggerSleepAction/等待线程、全部事件生产者、事件顺序、原版tick、短计时器量化、跨日/反向/多日和数值精度未完成还原/验收。
- 当前游戏RNG为独立确定性LCG，原版算法和消费顺序待还原；声音RNG独立，数字声音标签暂选首文件，变体时序待还原。
- 地图默认规则映射、科技别名、状态类型、观察者/游戏速度和预载极限的完整消费待完成。
- 本批未跑三图回归、旧完整测试、CPU逐位对照、全资产或性能基准；w3u/w3t、Miles/MIDI/音乐、界面、持续模拟和切图释放进入阶段A集中验证。

完整客户端目标保持未完成，接续优先地图画面与可操作流程。
