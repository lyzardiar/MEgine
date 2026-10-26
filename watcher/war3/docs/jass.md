# 原生 JASS 脚本链路

`src/jass.h/.cpp` 为独立客户端构建带源位置的语法树。类型、全局变量、常量、数组、native/函数签名、局部变量、调用、函数引用、条件、循环、exitwhen、return 和 debug 标记均保留，数字与字符串转义保留源文本供后续 VM 消费。当前阶段不执行脚本，也不把 native 声明当作已实现的游戏 API。

归档装配为公共 `Scripts\common.j`、公共 `Scripts\Blizzard.j`、地图 `war3map.j`；地图缺少根成员时读取 `Scripts\war3map.j`。`ArchiveScope::Common` 仅访问公共归档和共享公共缓存，避免地图替换基础声明；`ArchiveScope::Map` 仅访问当前地图，缺失时不退回公共同名成员。普通资源读取继续使用 Overlay。装配次序是当前实现边界，原版 VM 初始化和 config/main 的执行、配置覆盖次序仍需行为对照。

DotA_v6.83d 的实际脚本位于 `Scripts\war3map.j`，大小 3,026,043 字节，共 97,289 个 CR、没有 LF；读取器同时处理 CR、LF、CRLF。字符串内容不会被解释成语法关键字或运算符；`0.then` 保留 `0.` 实数和相邻 then。源文件名、来源归档、行和字节列用于错误定位。语法失败不返回部分 Program；config/main 必须由地图定义，为无参、返回 nothing 的非 native 函数。

每源限制 16 MiB、总源 32 MiB、最多 32 个源，词法每源最多 4,000,000 token；表达式和语句分别最多 1,000,000 节点，表达式嵌套 128、块嵌套 64、参数/实参 256。归档成员原有 128 MiB 读取上限继续有效，脚本在解码前额外核对 16 MiB。限制用于拒绝异常输入，不表示原版语言容量完全相同。

同一原生 EXE 提供开发检查，不创建渲染设备或解包工程：

```powershell
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --script-check --log "../../tmp/docs-artifacts/war3/jass/dota-script.log"
```

Win32 Release 下公共库加 DotA 构建出 91 个扩展类型、3,369 个全局、1,160 个 native 声明、5,599 个函数体、281,324 个表达式和 65,968 个语句。独立源文本声明计数核对类型/native/函数数量。8 项定向检查通过，覆盖 CR 源位置、声明/表达式树、语法词形相同的字符串、相邻数字/关键字、流程与数组、大小写/重复名、畸形输入/深度、公共来源隔离、地图脚本别名、缺失脚本和非法入口。结果不证明类型检查、链接、VM 或地图初始化已完成。

REA 在固定 Game.dll 找到 `common.j`／`scripts\common.j` 引用，原始记录为 `tmp/docs-artifacts/war3/jass/source-paths-rea.json`，它仅证明字符串存在。语言结构另参考 [lep/pjass](https://github.com/lep/pjass/tree/654c3cf7731eb472518e6915e9d7672a72652165) 的 grammar.y/token.l，固定提交 `654c3cf7731eb472518e6915e9d7672a72652165`，BSD-2-Clause；参考副本和许可证留在本地诊断目录，客户端未复制或链接该项目实现。原件脚本、诊断输出和第三方参考副本不随源码提交。

下一步为符号/类型解析、执行栈、数值与字符串语义、native 绑定以及地图会话。表达式绑定表尚未和原版执行作差分核对，接入 VM 前须验证优先级、结合性、短路与数值精度；不能将当前语法树测试当作原版执行语义证据。触发器、计时器、AI、单位创建和完整玩法仍保持待实现状态，开始游戏保持禁用。
