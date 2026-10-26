# 原生 JASS 脚本链路

`src/jass.h/.cpp` 为独立客户端构建带源位置的语法树。类型、全局变量、常量、数组、native/函数签名、局部变量、调用、函数引用、条件、循环、exitwhen、return 和 debug 标记均保留，数字与字符串转义保留源文本供后续 VM 消费。实数字面量同时编译为 `Expression.realBits`，执行时可直接读取原版格式位型。当前阶段不执行脚本，也不把 native 声明当作已实现的游戏 API。

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

## 原版整数／实数转换

`src/jass_numeric.*` 的 `Real` 保存原始 32 位位型，供后续执行层使用。`fromInteger` 对应 I2R，`toInteger` 对应 R2I；不通过宿主浮点强转决定结果。原版较大整数的 I2R 会直接截断尾数，例如 `16777219` 得到位型 `0x4b800001`（16777218），`INT32_MAX` 得到 `0x4effffff`。R2I 向零截断，越界、无穷及 NaN 按符号饱和到 INT32_MAX／INT32_MIN；零与次正规数转为 0。该行为由固定版本指令直接核对，不将其推广为其他版本规则。

REA 注册调用位于 `0x6f1e9b31–0x6f1e9b54`，把 I2R 绑定到 `0x6f1e7230`、R2I 绑定到 `0x6f1f2710`；实际转换函数为 `0x6f053b90`／`0x6f052f80`，前者使用 `0x6f052b50` 计算位长。原始证据为本地 `jass/numeric-{bindings,i2r,r2i}-rea.json`。

`war3_jass_numeric_tests` 检查已知边界并生成 C++ 结果；`tools/verify_jass_numeric_cpu.py` 在 Unicorn 中执行原版 native 包装和转换函数，没有替换代码边界。**695 组 I2R、3,072 组 R2I** 逐位一致，覆盖整数幂边界、精度边界、固定随机样本、所有 256 种指数、符号、尾数边界、NaN 和无穷。此检查不证明加减乘除、十进制读取、表达式排序、VM 或玩法已经一致。

## 实数算术与字面量编译

`Real::add/subtract/multiply/divide` 对应原版 `0x6f0529d0`、`0x6f0528b0`、`0x6f0527e0`、`0x6f052af0`，VM 的实数运算分支分别在 `0x6f7f25a6`、`0x6f7f2617`、`0x6f7f2688`、`0x6f7f270a` 调用这些函数。实现使用整数位运算，保留移位、截断、符号和 32 位回绕行为。除法使用原版倒数插值 `0x6f053ff0`；运行时系数为固定的 1,025 项 DWORD，来自原件 RVA `0x952fc0`，表 SHA-256 为 `00217ccf4688f6710bf65f677a8f4a81e535ab86997bcdbb2ce76c49265269b1`。

系数以 `src/jass_reciprocal.inc` 编入程序，来源/摘要写在文件头；`tools/generate_jass_reciprocal.py` 核对原件摘要后可复现生成。生成器仅用于开发，独立构建使用已提交的系数，不读取或加载 Game.dll，也不要求 Python。

`Real::fromDecimal` 对应十进制 token 回调 `0x6f7fb880`：整数部分、分数及分母按 32 位累积，再经过原版 I2R 和实数除法/加法得到位型，保留长十进制的回绕行为。接口接受无符号十进制整数或小数，符号由表达式层处理；科学计数和完整 token 分类尚未通过原版词法差分。当前不消费科学计数式实数字面量，错误保留源位置。

定向原版对照通过 **13,824 组操作数、55,296 次四则运算、2,061 个十进制 token**，覆盖零/符号、指数与尾数边界、NaN/无穷、倒数表全部 1,024 个插值区间、固定随机样本与长小数。原版函数在 Unicorn 中完整执行，token 接收对象和 ASCII 缓冲由检查提供，没有替换函数代码；不表示整个 tokenizer、VM 或对局通过。

底层除法函数与脚本零除策略分层验证：VM 在 `0x6f7f26e0–0x6f7f26f0` 先比较除数，再决定是否进入零除分支 `0x6f7f286f`。不能把数值函数对相同位型（包括零）的返回值直接当成脚本除零结果。该分支的线程/诊断行为、表达式绑定和完整 VM 仍待实现/对照。
