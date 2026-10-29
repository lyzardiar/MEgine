# 游戏版本与回放产品

独立会话在加载原始资源目录时检查 `war3.mpq` 与 `War3x.mpq` 常规文件，分别建立 ROC 与 TFT 的安装支持位；普通对局使用最高可用版本。`VersionGet` 读取当前会话版本，`VersionCompatible` 按原兼容矩阵判断（ROC 接受 ROC；TFT 接受 ROC 和 TFT），`VersionSupported` 单独查询安装支持位。无效版本值返回 false。安装支持目前只依据资源文件存在，尚未复现原版的产品与许可检查。

回放准备按 W3G 产品字段区分 `WAR3` 与 `W3XP`，将对应版本随地图请求传至会话，并在 World 附着、JASS 全局初始化及 config 之前设置。空、未知或旧格式未携带产品的回放沿用安装默认版本，不臆测产品；其原版版本与互通行为留待对照。已知产品要求相应公共归档存在，缺失时报告准备失败。会话初始化后禁止更改版本。选择 ROC 战役仍只影响战役上下文和进度，不直接修改当前客户端版本。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA `ev_979ab03da53728dbd0771959d1c41acbfd4a793d957c0b5eed6c82e89accfeae` 与 `ev_731d0c4c167dd94b283e7c01f9d4f83e6c4843620067d890fbb0dd305099e253` 分别确认 Compatible 与 Supported 不同入口；`ev_b984c1fafdd313e6fcbb32654eb526df0f4644d51dac60cf6764c77623b55456` 为兼容矩阵。版本从安装支持位和回放产品决定的静态证据见 `ev_eb04fbf5e54fb6de213e20c218c2840cd035bad42fc6c07c94a9dd7e7051b776` 与 `ev_dd4e6370f16161b7d621a9688a3e9920b432377520675498f807949d0ea3ccdc`。

Win32 Release 客户端、session 与 research 消费者已编译；`tests/session_tests.cpp` 增加产品映射、全局初始化／config 版本、兼容矩阵、独立支持位和生命周期保护检查，尚未执行。ROC 回放当前仍沿用现有包含 War3xLocal／War3x 的公共归档优先级，脚本和世界也在设置会话版本前读取；此接线不能证明 ROC 原版资源或回放兼容。实际 WAR3／W3XP 回放加载、缺档／未知产品、ROC 战役、安装许可校验及原版互通待阶段验证。
