# 崖壁纹理与顶沿

Author: MiYu

岩石、冰壁和砌石的扫描纹理使用两个平移样本，按世界坐标噪声及扫描高度混合。颜色、OpenGL 法线、粗糙度和高度共用混合权重；相邻区块使用相同坐标，纹理图集继续采用独立面板和显式梯度。原有 CC0 素材、线性数据通道及图集边缘保持不变，来源和 SHA-256 见 `samples/frostbound-realms/ground-sources.json`。

顶沿延续地图的土壤、草地和积雪权重。冬季积雪覆盖崖口，并落在朝上的岩石台阶；材质法线和粗糙度同步使用对应的地表数据。岩壁保留崖脚接触阴影。地形顶点、拾取、贴地、通行和地图数据沿用已验证的立体崖顶规则。

`cargo test -p mengine-rhi frost_ground_shader_compiles_for_all_backends` 验证 WebGPU、Vulkan、D3D12 和 Metal 编译。`python scripts/test-frost-ground.py` 核验扫描来源、图集、线性通道及材质绑定。`node scripts/qa-frostbound.mjs --ground-only --ramp-modules --deterministic-input` 生成三种地形环境的原生截图，验证存读档、试玩及上下坡；`node scripts/qa-frostbound.mjs --ground-only --cliff-styles --deterministic-input` 独立验证三种崖壁样式、撤销和地图／游戏存读档。详见 `cliff-material-validation.json`。

`MENGINE_QA_GROUND_SHADER_REV` 让原生 QA 和 Player 测量使用指定 Git 提交的地表着色器，其他资产和脚本保持当前版本；`MENGINE_QA_CAPTURE_PREFIX` 保留各组结果。对照提交为 `e8bb597b3cae630cce3ebcd5d5c4f631205297ae`。QA 记录实际加载的着色器哈希，Player 记录独立项目的地表资产哈希。

同一 Release 运行时、脚本、场景和素材，在 2560×1440 下预热 5 秒，再采样三个 5 秒窗口，Dota 帧循环 FPS 中位数为 24.2→24.6。该短采样未显示明显下降，p95 帧耗仍有尖峰；结果见 `cliff-material-before-native-player-performance-moba.json` 与 `cliff-material-after-native-player-performance-moba.json`。

独立 Player 的短时帧循环测量与原生截图不代表物理显示、长期对战帧耗或完整原版美术验收。原版全部地形模块、植被和游戏内容仍需完善。
