# 大型工程首次资源扫描

作者：MiYu

编辑器使用后台工作线程扫描资源并创建缺失的 GUID sidecar，扫描仍校验元数据、标记重复 GUID、按路径排序，并保留逐文件同步落盘的语义。首次打开 Frostbound 工程时，界面与其他原生请求可以继续执行。

失败进程的带行号调用栈位于 `list_project_assets -> collect_project_assets -> project_asset_info -> File::sync_all -> FlushFileBuffers`。该命令此前从 WebView 自定义协议回调同步执行，资源元数据写入占用了界面线程。诊断摘要保存在 `tmp/warcraft-effects/symbol-stacks-summary.jsonl`；修复后的线程摘要为 `asset-discovery-stacks-summary.jsonl`。

验证使用单独复制的编辑器和全新工程副本，未替换已安装程序。Release 构建通过；`project_asset_scan` 两项测试通过，覆盖资源分类、GUID 稳定性、无效元数据和重复 GUID。完整原生检查见 `native-status-effects-qa.json`：

- 场景包含 14,764 个实体，首次打开完成并进入 Play。
- 单机战场有 30 个活动原版状态特效；游戏暂停后组件时间保持不变。
- 两个真实 TCP 客户端各有 30 个活动特效；客机断线后重新连接并恢复。
- 两端材质管线拒绝数均为 0，没有特效加载、贴图缺失或脚本类型错误。

原生输入检查等待按下与松开各自完成运行时帧；暂停检查等待游戏实际报告暂停。测试保持联机运行时持续运行，没有通过暂停客户端来替代 TCP 验证。

复验入口：

```powershell
$env:MENGINE_EDITOR_EXECUTABLE='<当前生产协议编辑器 exe 的完整路径>'
cargo test -p mengine-editor-tauri --release --features tauri/custom-protocol --lib project_asset_scan
node scripts/qa-frost-effects.mjs
```

日志为 `tmp/warcraft-effects/asset-discovery-build.log`、`asset-discovery-tests.log` 和 `asset-discovery-input-qa.log`。此次通过覆盖 Agent 输入与原生 Game View；物理鼠标、音频及完整 Warcraft III 游戏验收仍未完成。
