# 冬季、森林与荒地地形套件

Author: MiYu

地图编辑器增加地形套件页面，`V` 在九个页面间切换；该页的按钮或 `1–3` 选择 Winter、Forest、Barrens。冬季自动混合积雪与土壤，森林使用草地与林地土壤，荒地使用暖色干土和稀疏草地。小地图同步使用对应的自动地表颜色。已有地表画刷、悬崖画刷、高度与缓坡编辑各自保留。

地图可选字段 `tileset` 为整数 0–2。旧地图缺少该字段时使用冬季，读取和保存不补写字段。选择套件可撤销，地图存读档、游戏存档、试玩和联机重连保留选择。服务端验证类型和范围；联机协议 30 拒绝旧协议 29，客户端与服务器需配套更新。

自动材质使用既有 CC0 土壤和草地扫描图集，颜色、法线、粗糙度共用覆盖权重。明确绘制的土壤、积雪、草地和岩地仍使用自己的权重，悬崖仍由逐格样式选择扫描图集。地块、外围底板、河床与水面通过材质属性块接收同一套件编号。真实高度、通行边界、河床形状与水域数据保持一致。来源、许可和源文件 SHA-256 见 `ground-sources.json` 与 `Assets/Licenses/ground.txt`。

验证入口：`node scripts/test-frost-tilesets.mjs`、`node scripts/test-frostbound.mjs`、`cargo test -p mengine-editor-host --test frost_sample`、`cargo test -p mengine-rhi frost_ground_shader_compiles_for_all_backends --lib`、`python scripts/test-frost-ground.py`。原生验收运行 `node scripts/qa-frostbound.mjs --tilesets --deterministic-input`，检查编辑器按钮和键盘、撤销、明确绘制的地表、64 个地形分块和水面属性、存读档，以及两个客户端的权威状态和重连。

当前运行包和原生项目与源脚本、着色器及地图逐项核对，六个内置地图内容保持原值。记录见 `terrain-tilesets-validation.json`、`native-tilesets-qa.json` 与 `player-smoke.json`；实际近景为 `tilesets-tileset-winter.png`、`tilesets-tileset-forest.png` 和 `tilesets-tileset-barrens.png`。

此阶段提供三种地形套件的完整编辑、持久化和渲染路径。原版所有地形套件、套件对应的完整植物与装饰、美术一致性及完整游戏仍需完善；原生自动化不代表人工物理输入、音频聆听、跨机器局域网或稳定 Player 帧耗验收。
