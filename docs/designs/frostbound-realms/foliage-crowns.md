# 森林树冠

Author: MiYu

森林的资源树与装饰树使用 Poly Haven CC0 的 `tree_small_02`。两档模型采用 Blender 4.5.9、源 `tree_small_02_LOD1` 和 0.30／0.20 的简化比例，近景为 148,519 个三角形，远景为 99,012 个三角形。叶片面积为 19.75／16.46 平方模型单位，分别保留源模型的约 73%／61%。源下载、许可、作者与 SHA-256 见 `realistic-sources.json`；`BLENDER=<路径> python scripts/import-frost-realistic.py --asset tree_small_02` 可重复生成。

叶片面积是本阶段的保真约束。`test-frost-biome-import.py` 要求两档至少保留源叶片面积的 70%／60%，同时检查近远景三角形上限、法线、基座、纹理与文件哈希。本阶段保留原贴图、材质、树种、采集规则、地图格式和协议，其他 67 份生成资产相同。

原生 Release 编辑器的三套地形切换、近远景网格及材质绑定、撤销、地图和游戏存读档、试玩、双客户端地图同步与重连均通过，着色器拒绝数为零。图像为 `crown-after-tileset-forest.png` 与 `crown-after-tileset-forest-far.png`。Player 的 757 份文件完成哈希与大小验证；启动检查及素材生成记录见 `foliage-crowns-validation.json`。

独立 Player 的性能对比尚未通过：旧模型基线在当前断开的 Windows 用户会话中记录到约一秒的帧循环间隔，三个十秒采样窗口分别只有 9／10／9 个样本，未达到脚本的样本门槛。此数据不构成硬件性能或物理显示验收。当前模型仍是小型阔叶树；成熟树冠、原版完整地形美术与整体游戏复刻仍待完善。
