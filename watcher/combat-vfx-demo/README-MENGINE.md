# combat-vfx-demo 来源与同步

本目录保存 [yuewen-huang/combat-vfx-demo](https://github.com/yuewen-huang/combat-vfx-demo.git) 的完整源码快照。`watcher/` 为多个待跟踪工程的总目录，本工程独占 `watcher/combat-vfx-demo/`。

- 跟踪分支：`main`。
- 本地版本：`aee3b51bb2f2`，版本类型为 Git 提交。
- 完整提交：`aee3b51bb2f22bd0262a4e191ac706e2cc0f82a5`。
- 上游提交时间：`2026-10-23T11:28:00Z`；导入日期：2026-10-24。
- 机器可读记录：[UPSTREAM.json](UPSTREAM.json)，包含来源地址、提交、源码树、归档摘要及文件数量。
- 上游许可证：[LICENSE](LICENSE)，为 PolyForm Noncommercial License 1.0.0，保留原始 Required Notice。

上游 272 个文件、36,832,842 字节逐文件核对 Git blob 摘要后原样保存，包含隐藏配置、媒体、工具和许可证。Git 元数据不随快照导入。`UPSTREAM.json` 和本文件是 MEngine 额外维护的记录，见 `localOnlyFiles` 字段。Godot 工程的运行方式见上游 [README.zh-CN.md](README.zh-CN.md)；本次导入仅保存来源工程。

## 按需同步

从 MEngine 仓库根目录检查上游分支当前提交：

```powershell
$source = Get-Content -Raw watcher/combat-vfx-demo/UPSTREAM.json | ConvertFrom-Json
git ls-remote --heads $source.repository $source.branch
```

需要同步时，先把旧提交和选定的新提交下载到 `tmp/docs-artifacts/watcher-sync/<提交号>/`，对照上游差异及本地修改，再更新本工程的上游文件和已删除路径。保留 `localOnlyFiles` 中的维护文件，以及尚未合并的本地修改；仅处理本工程目录。

完成后核对文件清单与内容摘要，更新 `UPSTREAM.json` 的版本、提交、源码树、时间、归档摘要、文件数量与字节数，以及本文件和 `watcher/README.md` 中的版本记录。验证结论登记在 `docs/testing-batches.md`，临时归档和原始校验结果保存在 `tmp/docs-artifacts/`。同步由后续任务按需要发起。
