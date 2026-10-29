# Human06 脚本的无值返回兼容

固定安装的 Human06 原图脚本在 `Trig_Malganis_Booting_Player_Actions` 中，对 `returns nothing` 的函数使用 `return false`。该图与 War3Patch.mpq 的同名地图字节一致，SHA-256 为 `D726DA487992DDA8923EBF9C5FD95AA21C67EDA425123F6EF64A0DB02D94B076`。

链接器仅接受该返回类型下的布尔字面量 `false`；执行代码将其编译成无值返回。其他返回表达式仍按类型检查拒绝，正常布尔函数的返回不受影响。此规则是为现有地图增加的受限兼容处理，并非已确认的原版编译器行为；原版二进制包含 `unexpected return expression` 诊断，需通过原版实际运行继续对照。

定向检查：独立 Win32 x86 探针检查提前返回、嵌套调用栈和正常布尔返回，并拒绝 `true`、整数、逻辑表达式、函数调用及错误的非 void 返回类型，见 `tmp/docs-artifacts/war3/human03-continuation-1031/void-return.log`。使用相同隔离构建装载 Human06 原图，越过原编译错误，约 110 秒恢复控制，推进到 400 秒；见 `tmp/docs-artifacts/war3/human03-continuation-1031/human06-after-return.log`。

待阶段验证：在原版 1.27 实际执行该地图及同类脚本，确认诊断和行为；在产品客户端验证关卡初始化、控制、剧情与胜负。针对性回归应执行 `war3_jass_runtime_tests` 的 `void_false_return_compatibility` 断言。
