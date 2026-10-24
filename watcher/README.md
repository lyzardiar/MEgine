# 待跟踪工程

`watcher/` 是待跟踪外部工程的总目录。每个工程独占一个子目录，保留上游文件、许可证及各自的来源和版本记录，按需要手动同步。

| 工程 | 上游仓库 | 本地版本 | 维护记录 |
| --- | --- | --- | --- |
| [combat-vfx-demo](combat-vfx-demo/) | [yuewen-huang/combat-vfx-demo](https://github.com/yuewen-huang/combat-vfx-demo.git) | `aee3b51bb2f2` | [UPSTREAM.json](combat-vfx-demo/UPSTREAM.json)、[同步说明](combat-vfx-demo/README-MENGINE.md) |

后续工程放在 `watcher/<工程名>/`，分别记录仓库地址、分支及完整 Git 提交号。同步时只处理对应工程的子目录，并更新其来源记录与本表版本。
