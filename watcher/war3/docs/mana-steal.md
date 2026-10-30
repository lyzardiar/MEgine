# 魔法吸取权杖

原版 `woms` 使用 `Aste`，可随机掉落，两次使用，射程 650，冷却 10 秒。客户端复用物品目标选择、接近、施法事件、消耗次数与共享冷却；释放时从目标现有魔法扣除至多 50 点并恢复持有者魔法，超过持有者上限的部分不保留，使用原技能模型与声音。

原版 1.27 `Game.dll` 的 `CAbilitySteal` 虚表槽 `+0x424` 指向 `0x6f5ba750`：DataC 非零时 DataA 为固定值，否则乘以目标当前魔法；DataD 对 DataB 的选择同理；DataE 非零进入保留目标分支。`0x6f67c940` 将扣减量限制在目标现有魔法内。原始静态证据为 `ev_fac6a8f0b644503d5dff63b37eb210f8b48d578a14cf9e3e133fa3ce1623822a`、`ev_797da09b4d607b2d994df30a409d2701c318510c5beb460838b954093c52126b`；GetUnitState 对应关系见 `ev_eeface0a90f439a989678fe81c35d28e3aa1b679b4715a13bd4fd604d21516ec`、`ev_c48721d51bfe66823ea80c187b933c3114c6806d64b2afaebf75091ff9cc9a4f`。数据来自原安装 `War3Patch.mpq` 的 ItemData、AbilityData 与 ItemStrings。

DataA／DataB 分别参与魔法和生命转移；DataC／DataD 选择固定值或目标当前资源比例。DataE 非零时扣除目标资源并把实际扣除量转给施法者；DataE 为零时消耗目标并按配置量转给施法者。生命变化使用实际死亡、状态与事件流程，回调造成施法者失效时停止后续效果。目标过滤使用现有技能过滤，包括非自身、可见、存活与免疫判断。

对生命分支的静态追踪：DataE 为零时，原版设置目标死亡相关标志并调用 CUnit 虚表 `+0x124` 置零生命；DataE 非零时，调用 `+0x128` 修改生命并返回前后变化值，之后再处理魔法与施法者资源。CUnit 虚表与相关函数证据为 `ev_48dbeba9ae21f5858b29c11df23958d469fc4af5eb8ea35329d7f14396842a69`、`ev_06100ba61e01f94da3a08ee796a562ccb662eb3dd28db965f170bdc9f1f1acbc`、`ev_8c1e1a17e5d635e66dd7049e7965d2195760dea38007e9f4c8e57e3c0662fa94`。本机 Rizin 指令摘录位于 `tmp/docs-artifacts/war3/steal/steal-disassembly.txt`；施法者增减量的实现按上述调用关系连接现有生命与魔法状态，目标死亡标志、事件顺序、回调重入及原版结果仍需运行态对照。

Win32 Release 客户端和专项编译通过。`tests/generate-steal-fixture.py` 生成隔离地图，`war3_spell_tests.exe <data-root> <fixture> steal` 通过 4/4，覆盖固定／比例、资源上下限及目标消耗，未加载 Game.dll。目标过滤、生命阈值、免疫、费用／次数／冷却、重入及多人和原版一致性待阶段验证。
