# 牛头人酋长原生玩法验收耗时

Author: MiYu

| 阶段 | 秒 |
|---|---:|
| project open and ready | 86.618 |
| source hero, portrait, W/T/E/R cards and endurance geometry | 42.576 |
| travelling Shockwave and F5 continuation | 72.491 |
| War Stomp source effect and distinct hero stun | 19.659 |
| seven-second Reincarnation Death Stand Birth and F5 recovery | 144.873 |
| 合计 | 366.217 |

阶段计时包含 RPC，不能再次叠加命令时间，也不代表全程开发耗时。复用了现有 Release 程序；生成客户端预检凭据按 Main/scene 哈希复用；一般回归分段续跑。完整场景为 73,925 个实体。

首次验收在冲击波阶段因自动化目标落在射程外结束；其已记录阶段合计 162.144 秒，正常退出。最终流程使用射程内目标，并检查实际施法开始、原版模型 X 轴与波方向一致、世界缩放为 2。两次流程不能当作速度对照。
