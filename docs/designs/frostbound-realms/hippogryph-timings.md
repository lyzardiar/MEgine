# 角鹰兽阶段时间记录

Author: MiYu

实际原生验收阶段耗时；阶段可包含查询与输入命令。此表不把并行工作重复计入总时间。

| 阶段 | 秒 |
|---|---:|
| project open and ready | 78.942 |
| original Hippogryph bodies and portrait cameras | 102.688 |
| H Wind production and saved queue continuation | 245.552 |
| 原生阶段合计 | 427.182 |
| 生成客户端排演 | 1.402 |

| 命令种类累计 | 秒 |
|---|---:|
| playback.step | 226.643 |
| playback.input | 74.052 |
| entity.get | 43.139 |
| panel.focus | 38.306 |
| project.open | 14.691 |
| view.screenshot | 10.228 |

此阶段原生验收一次通过，生成客户端排演先覆盖 H 训练、两种头像相机、空中选择与存档载入。原生验收与回归检查并行；不重复启动编辑器，不修改共享 asset-library。

回归首次遇到新模型未登记在视觉测试加载清单；第二次遇到尸体测试将所有飞行生物归为持续尸体；第三次遇到旧存档测试夹具没有关闭新增的飞行单位规则。三次运行分别耗时 17.137、24.585、128.415 秒。它们是测试适配失败，不能计为完整通过。

进一步节省时间的具体位置：新增单位前先检索遍历全部 types 的视觉/尸体测试，以及显式关闭规则版本的旧存档夹具；先运行这些定向检查，再运行带真实 TCP 的完整入口。原生 entity.get 与 playback.step 的往返耗时已逐命令保留，可以在保持验收内容的前提下合并独立实体查询。
