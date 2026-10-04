# 成熟森林与独立材质网格

Author: MiYu

森林资源与装饰使用 Poly Haven CC0 的 `jacaranda_tree`，保留宽树冠与多分枝轮廓。原作者为 Rico Cilliers，Rob Tuytel 提供指导。来源、下载地址、原始文件与生成文件的 SHA-256 记录在 `samples/frostbound-realms/realistic-sources.json`；许可随 Player 放在 `Assets/Licenses/PolyHaven-models.txt`。

Blender 4.5.9 从作者的 `jacaranda_tree_LOD1` 分别简化树干、枝条与叶片。树干比例为 0.15／0.06，枝条为 0.05／0.025，叶片为 0.12／0.085。近景共 220,161 个三角形，远景共 175,531 个三角形；叶片面积为 2,172.37／1,933.64 平方模型单位，保留源叶片面积的约 88%／78%。测试要求近景至少保留 85%，远景至少保留 75%，远景与近景面积比至少为 85%。

导入器通过 `separate_materials` 输出三组独立的 PBR 网格与两档 `lod_parts`。它们共用基座、尺度和朝向；树干与枝条采用不透明材质，叶片采用双面裁剪材质，保持源颜色与透明度。枝条 UV 保留原始负值及跨越数百次的重复坐标，由引擎重复采样 1K 纹理。每组材质使用独立的颜色、法线和 ARM 图，材质贴图转换必须一致。

资源与装饰的呈现槽位由模型目录自动确定。三部分共同显示、隐藏和切换 LOD；切回单网格树种时关闭多余部分。新材质部分追加到场景末尾，原有 3,908 个实体的 ID、组件与引用保持一致。资源树的树冠最大宽度为 6.5 世界单位，装饰树为 7.5。单位导航、采集数量、地图版本与协议 31 保持原有规则。

执行 `BLENDER=<Blender 4.5.9 路径> python scripts/import-frost-realistic.py --asset jacaranda_tree` 可重复生成。180 MB 的原始 Blender 文件作为本地源缓存，由导入器自动下载并验证哈希，不纳入 Git 或 Player；十份原始纹理与全部生成资产纳入 Git。新检出执行源一致性测试前先运行导入命令。独立 Player 包含全部运行所需资产。

`test-frost-mature-forest.py` 检查共享基座、两档网格、树冠面积、重复 UV、源颜色与透明度及所有文件哈希；`test-frost-biome-trees.mjs` 检查三种地形的模型、材质部分、采集与存档。`qa-frostbound.mjs --tilesets --deterministic-input` 在真实 Release 编辑器中检查各部分网格／材质／变换、单网格地形的多余部分隐藏、三地形切换、撤销、地图和游戏存读档、试玩、双客户端与重连。截图为 `mature-forest-tileset-forest.png` 和 `mature-forest-tileset-forest-far.png`；阶段验证与包信息见 `mature-forest-validation.json`。

这是森林呈现与素材导入的一阶段交付。整体原版地形美术、游戏内容和编辑器复刻仍未完成。物理输入、音频、跨机器联机与稳定 Player 帧率尚未验收。
