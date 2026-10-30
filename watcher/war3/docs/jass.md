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

当前符号/类型、表达式组合、字面量与执行栈范围见下节。运行层已接入自编脚本执行，地图游戏 native 和会话仍待实现。优先级和结合性已作原版解析状态机对照，短路/实参顺序有原版发射器依据；完整 VM 行为仍须逐项核验。触发器、计时器、AI、单位创建和完整玩法仍保持待实现状态，开始游戏保持禁用。

## 类型与符号解析

`src/jass_module.*` 的 Module 拥有 Program、源文本与类型/函数/槽位表。它解析 handle 继承并拒绝未知父类型、非 handle 父类型与继承环；检查赋值、数组形状与整数下标、调用实参、条件和返回值。兼容规则包括 integer 到 real、null 到可空类型以及派生 handle 到祖先。函数签名先注册，表达式的变量、数组、调用与 code 引用保存直接索引；set 目标另存赋值绑定。参数槽在局部变量之前，局部名称覆盖同名全局。表达式使用显式后序栈，20,000 次左结合运算不会递归消耗 Win32 调用栈。

产品 `--script-check` 依次构建语法树、Module 和 Runtime 执行指令，成功时写入 `jass_link=passed`、`jass_bytecode=compiled`；失败保留源名、行、列和类型诊断。此入口不执行全局初始化、config/main 或任何 native。当前静态检查未覆盖全部路径的返回值、确定赋值和 constant 函数纯度；运行层对缺少返回值显式报错，不能把源脚本可链接作为原版 VM 一致性证明。

Win32 Release 下 `war3_jass_module_tests` **9 通过、0 失败**，覆盖继承/null、非法类型图、全局/参数/局部及赋值槽位、前向调用/code、数组、初始化与常量、条件/返回/运算符、长表达式、移动后源所有权与绑定完整性。继续开发所需的 DotA 产品集成退出 0，解析 281,324 个表达式、65,968 个语句，无 Game.dll。证据在 `tmp/docs-artifacts/war3/jass/module-{build.log,tests.log,dota.log}`。三图合并与诊断集成列入 W010，累计三个功能任务后执行；已通过且未变化的数值差分不重复运行。

```powershell
./build/windows-x86/bin/Release/war3_jass_module_tests.exe
```

## 局部变量默认值

每次创建函数帧时，未显式赋值的数值和布尔局部值为零，句柄和 code 为 null，字符串局部值暂按空字符串初始化；数组仍沿用现有稀疏元素默认值。显式字符串 null 与空字符串保持区分，而未初始化的全局／数组字符串目前仍为空句柄。DotA_v6.83d 的选中事件函数 `UVO` 将未赋值的局部字符串与空串比较，旧运行层在选择 `-sd` 商店时抛错；局部默认值修复后，隔离探针已通过 `-sd` 选英雄商店的真实购买命令，见 `tmp/docs-artifacts/war3/dota-flow-1030/purchase-heroes-final.log`。参考 [WurstScript 的 JASS 默认值说明](https://wurstlang.org/features/backends.html)；隔离构建的 JASS 运行时检查 14 通过、0 失败，覆盖新增局部值及现有运行时用例。1.27 对局部／全局／数组字符串的 null 与空串比较及内存表示尚无原件逐类型对照，需集中验证。

## 原生执行层

`src/jass_runtime.*` 将已绑定 AST 编译为本项目指令：显式调用帧、局部/全局槽位、稀疏数组、if/elseif、loop/exitwhen、return、短路、code 引用和有类型的 native 调用。表达式编译使用显式工作栈，脚本调用使用独立帧向量；20,000 次左结合运算不递归占用宿主栈。模拟指令格式为客户端实现，不声称兼容原版字节码文件。

构造 Runtime 只编译指令。先绑定所需 native，再调用 `initialize()` 按声明顺序执行全局初始化，成功后才允许调用入口；初始化失败的实例保持不可运行。参数、赋值及返回值消费 Module 的兼容规则，integer 到 real 使用原版 Real 转换。I2R/R2I 根据原 native 声明验证签名并自动绑定；其他 native 必须显式实现，未绑定时报告源位置和名称，不返回默认结果。native 可同步调用 code 引用，嵌套调用共享本次指令预算；错误会释放本次帧与操作数，已修改的全局状态保留。

REA 的 AND／OR 发射器 `0x6f7e91d0`／`0x6f7e9bf0` 先发射左表达式，再分别发射 `0x2a`／`0x29` 条件跳转，跳过右表达式并产生 false／true。原版参数列表规则 45／47、构造器 `0x6f7f3470` 和发射器 `0x6f7e92a0` 先消费此前参数列表，再发射新参数，运行层据此从左到右求实参。原始记录为 `runtime-{shortcircuit,call-grammar,parameters}-rea.json`。这些是代码路径依据，完整调用与调度仍需原版执行差分。

字符串支持原版八种转义（反斜杠、两种引号、r/n/b/f/t）。Rawcode 保存单字节及四字节的有符号字节累积，支持转义和 `u`／`U` 四位十六进制。`tools/verify_jass_literals_cpu.py` 对照原版字符串构造器解码循环 `0x6f7f4bb1–0x6f7f4c0c` 与完整 Rawcode 回调 `0x6f7fb5c0`：**5 组字符串、268 组 Rawcode** 一致，无替代函数代码。循环输入均为合法转义；完整分配、驻留、拼接、比较和词法接受范围未由这个对照证明。未知字符串转义在客户端显式拒绝。

当前开发预算默认为每次外部调用 5,000,000 条指令、1,024 个脚本帧、64 层同步 native 重入、各 262,144 个局部槽/操作数值、单字符串 16 MiB；数组只接受 0..8191。越界、零除、INT_MIN/-1 及缺少返回均带位置报错。这些诊断/预算是当前实现边界，不声称原版对所有异常输入的线程状态相同。句柄生命周期、挂起/计时器调度、随机数、全部原生函数和完整原版 VM 行为仍待实现/差分。

`war3_jass_runtime_tests` 执行自编脚本，13项检查通过，覆盖初始化、存储、流程、短路、实参次序、递归/code 同步重入、Real 消费、字符串/Rawcode、native 类型错误、句柄祖先转换、初始化失败、嵌套 loop、预算共享/释放及长表达式。W010–W012 的36项合并检查与三图产品指令编译已通过；Amazonia／BootyBay／DotA 分别为21,086／19,785／370,552条指令，原图全局初始化和config/main均未执行，开始游戏保持禁用。证据为 `tmp/docs-artifacts/war3/jass/batch-runtime-*.log`、`batch-w010-w012.json` 及 `runtime-{native.json,literals-cpu.json,literals-cpu.log}`。

```powershell
./build/windows-x86/bin/Release/war3_jass_runtime_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/runtime-native.json"
# 仓库根目录运行
python watcher/war3/tools/verify_jass_literals_cpu.py
```

地图native由[ScriptSession](session.md)管理。`--config-check`直接执行公共库/地图全局初始化和config；它与仅编译的 `--script-check` 分开记录。[World](world.md)已持有原图空间并保存21个空间/相机/环境native状态，`--main-check`尝试执行原图main。完整main、世界渲染、调度和游戏规则继续待实现。

## 原版表达式组合与整数 token

固定版本的解析优先级从低到高为：`and`、`or`、`== !=`、`< > <= >=`、`+ -`、`* /`、一元 `not + -`。`and`、`or` 按右结合，其余二元运算按左结合。因此 `true or false and false` 组合为 `(true or false) and false`，`true and false or true` 为 `true and (false or true)`；原版规则直接用于产品解析器。

`src/jass_literal.*` 对十进制、前导 0 的八进制、`$`／`0x`／`0X` 十六进制按无符号 32 位累积，溢出保留低 32 位，不依赖宿主字符串转数值函数。语法树的 `Expression.integerBits` 保存 Integer 与 Rawcode 结果，负号仍属于一元表达式；字符串解码范围见运行层。`08` 等非法整数保留源位置报错，不将回绕误报为超出范围。

`war3_jass_frontend_tests` 5 项检查通过，生成 **245 组表达式结构、591 个整数 token**；受影响的语法检查 9 通过、0 失败。`tools/verify_jass_frontend_cpu.py` 核对固定原件摘要，在 Unicorn 中执行整数回调 `0x6f7fb830`／`0x6f7fbab0`／`0x6f7fb970`，199 个十进制、196 个八进制、196 个十六进制逐位一致，591 个 token 另经原版 lexer `0x6f7faff0` 核对分类、长度和结果。

表达式检查执行原版 `0x6f7f9070` 的移进/归约指令及解析表，输入已分类的终结符；在 `0x6f7f92b2` 把语义动作替换为符号归约记录，到 return 表达式归约时停止。245 个组合包含全部二元运算符配对、一元运算、括号和布尔边界，均与 C++ 语法树一致。这证明所测表达式的组合关系，不运行原版 AST 构造、类型检查、编译器或 VM，也不证明完整源文件验收；部分组合仅有语法意义。独立 lexer 的外部 CRT memmove 使用受控内存复制边界，整数回调没有替换游戏函数代码。客户端和原生测试不加载 Game.dll，分析工具仅把它作为 PE 指令数据读取。

DotA 产品 `--script-check` 继续退出 0，声明及表达式/语句数与前批一致；三图合并在 W010–W012 达到 3/3 时执行。证据在 `tmp/docs-artifacts/war3/jass/frontend-{build.log,tests.log,native.json,cpu.json,cpu.log,parser-tests.log,dota.log}`；REA 原始依据为 `frontend-{integers,parser,identifiers}-rea.json`。复现（仓库根目录）：

```powershell
./watcher/war3/build/windows-x86/bin/Release/war3_jass_frontend_tests.exe tmp/docs-artifacts/war3/jass/frontend-native.json
python watcher/war3/tools/verify_jass_frontend_cpu.py
```

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

DotA 地图的距离计算调用 `Pow(real, real)`；该 native 使用单精度结果并接入现有数学函数的非有限值错误处理。负底数的分数指数、溢出和特殊浮点值目前沿用本客户端边界，原版数值精度和异常语义尚待对照。

`StringHash` 已接入脚本运行时：空字符串返回零，其余字符串按字节在首个 NUL 或 1023 字节截断，ASCII 小写转大写、正斜线转反斜线，再以固定 32 位混合求值。固定 1.27 `Game.dll` 的 `0x6f1f8470` 调用 `Storm.dll` ordinal 590；后者 SHA-256 为 `f8f519cfaa6275a5172a014f0abed2212284390a33f1194677155a7d408e63eb`。七组 ASCII 输入的原 DLL 返回值与独立算法计算一致，证据位于 `tmp/docs-artifacts/war3/storm-hash-{probe.ps1,original.txt}`；新增客户端消费者断言尚未执行。多字节文本在当前 UTF-8 字节表示与原版字符串编码间的兼容性留待集中对照。

`Deg2Rad`／`Rad2Deg` 已绑定到 JASS 数值运行时，使用固定版 `Game.dll` 中的常量位型 `0x3c8efa35`／`0x42652ee1` 和已有的原版实数乘法。只读指令及常量记录在 `tmp/docs-artifacts/war3/angle-natives-1031.txt`；多种实数和特殊值的逐位行为留待集中对照，新增客户端断言尚未执行。

`==` 的实数分支使用原版实数减法，再比较差值绝对值是否严格小于位型 `0x3a83126f` 的容差；`!=` 的实数分支比较操作数位型。因此两个近似实数可能同时满足相等与不等，混合整数先转为原版实数。固定版 `Game.dll` 的相等调用位于 `0x6f7f227a–0x6f7f2299`，辅助函数为 `0x6f03f960`；不等分支在 `0x6f7f22be–0x6f7f2341`。原版辅助函数在 Unicorn 中检查 5 组，包括容差边界和负零；记录在 `tmp/docs-artifacts/war3/dota-hero-1031/`。完整 VM 类型转换、特殊浮点、其他比较操作与原版对照留待阶段验证。

原版 1.27 的数组读取入口 `0x6f7ed050` 按无符号下标与已分配大小比较，越界返回零；写入入口 `0x6f7ec6c0` 越界不写，扩容上限为 8192。REA 指令证据 `ev_22798a2e85bd3666dde933c98f0f267649699911ae97939768c487c209ca1aa3` 包含 VM 读取调用及上述边界。运行时对负数和大于 8191 的下标返回对应类型的零值并忽略写入，正常范围保持稀疏存储。Win32 Release 运行时检查 16 通过、0 失败；类型细节和极值写入的原版运行对照待阶段验证。
