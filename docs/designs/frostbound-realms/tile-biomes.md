# 地块覆盖与三维植被

Author: MiYu

森林自动地表在两单位世界网格上使用填满／空白的角点覆盖，形成连续的草地地块。扫描材质高度打散窄过渡边缘，颜色、法线与粗糙度共用覆盖权重；显式绘制的地表、悬崖高度、坡道、水域和地图数据格式保持原有规则。

冬季使用三种云杉，森林使用阔叶树，荒地使用箭袋树。资源树与装饰树共同遵循地图地形套件。两个新模型来自 Poly Haven CC0，原作者、下载地址、源文件和生成文件的 SHA-256 见 `samples/frostbound-realms/realistic-sources.json`。树冠与树干均使用真实三维网格，两档模型保持相同基座、尺度和朝向，采集规则不变。

阔叶树使用 Blender 4.5.9 的网格简化生成两档模型，比例分别为 0.10 和 0.08；生成器保留叶片表面与源 UV。透明图按 16 位灰度归一化到 8 位，颜色在透明边缘外扩 32 像素。近景／远景分别为 49,506／39,605 个三角形，叶片面积分别为 10.84／8.98 平方模型单位。箭袋树为 11,998／3,999 个三角形。`BLENDER=<Blender 路径> python scripts/import-frost-realistic.py --asset tree_small_02 --asset quiver_tree_01` 可重复生成，选定导入保留其余模型和生成记录。

`test-frost-biome-import.py` 检查 59 份源文件、57 份生成文件、原始叶片颜色与透明度、网格预算、法线、基座和树冠面积。`test-frost-biome-trees.mjs` 检查三套地形的资源／装饰模型、近远景、稳定尺度、采集和存档。原生 `qa-frostbound.mjs --tilesets --deterministic-input` 检查三套地形的实际资源／装饰材质绑定、两档网格、撤销、地图和游戏存读档、试玩、双客户端及重连；截图为 `tile-biome-*.png`，报告为 `tile-biome-native-qa.json`。四后端地表着色器编译和完整 JavaScript／TCP 规则测试通过。Player 文件哈希、启动检查及范围见 `tile-biomes-validation.json`。

这是地形与植被表现的阶段改进。原版全部地形模块及整体美术复刻仍未完成；上述自动化检查不等同于物理输入、音频、跨机器联机和稳定 Player 性能验收。
