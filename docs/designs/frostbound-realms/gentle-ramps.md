# 双格缓坡

Author: MiYu

冬落盆地、Supply Road 与 Highland Pass 的入口使用连续两格的缓坡。每格上升 1 世界单位，合计在 4 世界单位跨度内连接一级悬崖；两格共享中间高度。岩壁仍由相邻高度差生成，周围低地和已有连续地表起伏保持原值。

地图高度允许 0.5 级步进。坡道值 1–4 保留原有东、西、南、北单格坡；5–8 对应同方向的半高度斜面。原生网格沿用整数角点编码，JS 地表、移动、体型净空、选中射线与单位高度使用相同角点和面片。旧地图、存档与已发布地图保留其原有高度和坡道数组，不自动修改。

编辑器高度页默认使用双格缓坡，G 切换单格陡坡。缓坡需要向上连接干燥平台；绘制时同时修改入口和上方一格，转换回陡坡时恢复上方平台。一次 Ctrl+Z 撤销两格修改，保存、读取与试玩保留形状。方向按钮及选中信息显示当前模式。

联机协议为 27，客户端与服务端需同步更新；旧协议被明确拒绝。地图、权威状态与重连携带实际半高度坡道，两个原生客户端的 64 个地块网格与服务端地图逐个核对。

验证：`node scripts/test-frost-gentle-ramps.mjs`、`node scripts/test-frostbound.mjs`、`cargo test -p mengine-assets terrain_mesh --lib`、`cargo test -p mengine-editor-host --test frost_sample`。72 份 JS／原生地形对照覆盖四向缓坡的跨区块拼接，另有四向大型攻城单位往返、旧图读取与保存检查。

原生编辑和登顶流程：`node scripts/qa-frostbound.mjs --ridge-layout --gentle-ramps --deterministic-input`。两个原生客户端及重连：`node scripts/qa-frostbound.mjs --network-only --gentle-network --deterministic-input`。验收记录为 `native-gentle-qa.json`、`native-gentle-network-qa.json`、`gentle-ramps-validation.json`；截图为 `gentle-ridge-overview.png`、`gentle-gentle-editor.png`、`gentle-ridge-summit.png`。同机位前一版为 `strata-ridge-overview.png`。

当前阶段完善坡道结构和编辑，不代表原版全部地形套件或完整游戏已复刻。原生自动化不包含人工物理输入、音频聆听和稳定帧率验收。
