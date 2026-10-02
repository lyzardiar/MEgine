# 悬崖材质套件

Author: MiYu

地图编辑器的地表页面提供“Cliff”按钮，依次选择岩石、冰壁和砌石材质。选择作用于整张地图的悬崖面；顶面土壤、积雪、道路、河岸和战争迷雾继续使用地图地表数据。撤销、地图保存加载、试玩和游戏存档保留悬崖类型。旧地图默认使用岩石，非法类型会在地图验证时被拒绝。联机协议为 25，服务器在初始状态、后续状态和重连中传递已验证的类型。

三套材质复用相同的立体崖壁、圆弧转角和坡道网格，通过世界坐标投影保持跨区块拼接。冰壁和砌石分别使用 ambientCG Ice001、Poly Haven castle_brick_07 的 CC0 颜色、OpenGL 法线、粗糙度和高度素材。各材质定义自己的纹理尺度与法线强度；新增类型没有增加着色器纹理槽。

`samples/frostbound-realms/ground-sources.json` 保存原始下载地址、作者、许可和 SHA-256。ambientCG 原始 ZIP 及所用的四个成员分别有哈希；导入器只提取清单指定的成员，并在写入前验证内容。法线 X/Y、粗糙度和高度按线性 RGBA 打包。运行包包含 CC0 许可文件。

```powershell
python scripts/import-frost-ground.py
python scripts/test-frost-ground.py
node scripts/build-frostbound.mjs
node scripts/test-frostbound.mjs
cargo test -p mengine-rhi frost_ground_shader_compiles_for_all_backends
node scripts/qa-frostbound.mjs --ground-only --cliff-styles --deterministic-input
```

原生验收使用独立 Release 编辑器、QuickJS 和 Agent 逐帧输入，验证三种材质的 64 个区块具有相同网格、材质选择、撤销、地图保存加载、试玩和游戏存档恢复，以及零材质管线拒绝。截图是同机位的实际运行画面。该逐帧编辑过程不作为稳定运行帧率验收；物理鼠标与听音尚未验证。

本阶段提供三套可选择的悬崖材质。独立的城市悬崖造型、冰崖块体网格、完整原版地形套件及经典地图仍需完善。
