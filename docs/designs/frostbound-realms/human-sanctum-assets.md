# 人族神秘圣地原版素材与规则

Author: MiYu

神秘圣地、牧师、女巫、破法者及三种攻击投射物已转换为引擎可用模型。牧师和女巫采用冰封王座的 `Priest_V1`、`Sorceress_V1` 变体；破法者采用 `BloodElfSpellThief`，保留原版 `modelScale=0.8`。建筑和单位的显示尺寸由原始坐标、模型边界及原版缩放计算。

`human-sanctum.json` 保存四个主体的属性、生产链、四项研究、十个主要技能、所有实际绑定技能的原始行、目标类型、科技条件、快捷键和原版指令。牧师/女巫训练各有两级，第二级需要城堡；控制魔法研究为 `Rhss`，魔法岗哨为 `Rhse`。控制魔法的 `Cost1`、生命值比例和 `DataC1` 数值分别保留，最终动态扣费关系需要继续核验。

`human-sanctum-models.json` 包含七个模型、44 个材质层部件，保留原始骨骼动画、节点 billboard、部件显隐与队色。93 个材质都有唯一 meta，48 张指令图标的普通/禁用及自动施法状态像素与原始 BLP 一致。

原版档案按 `war3 → War3x → War3xLocal → War3Patch` 优先级选取本阶段所需完整文件，保留63份原始 bytes、来源档案名及 SHA-256。模型来源、转换器、骨骼 metadata 与产物签名见 `human-sanctum-sources.json`、`human-sanctum-node-sources.json`。游戏素材遵循 Blizzard 原版资产条款；转换器 MIT 许可单独保存。

复现需要保留的原始来源、已转换共享资产库、metadata reader 与 native bounds probe。以下命令不读取游戏安装目录：

```powershell
python scripts/import-frost-human-sanctum.py --output <输出目录> --source-sample samples/frostbound-realms --game <不存在的目录> --library <共享资产库根目录> --pose-probe <gltf_bounds.exe> --metadata-reader <NodeMetadata.dll>
python scripts/test-frost-human-sanctum-assets.py --pose-probe <gltf_bounds.exe> --reproduce --library <共享资产库根目录> --metadata-reader <NodeMetadata.dll>
node scripts/render-frost-human-sanctum.mjs
```

独立测试重新解析原始 SLK/TXT，核对属性、生产链、科技、技能、图标像素、模型变体与尺寸，并通过 native probe 复核四个主体的边界。517项文件（含收据）可逐字节复现；已修改的签名产物、未登记同名产物和损坏原始来源都会在写入前被拒绝。导入器检查 Git 索引，保护稀疏工作区中未落盘的已有文件及大小写拼写。

`human-sanctum-native-models.png` 使用引擎的原生 Game View 渲染器生成：下方展示四个主体的真实比例，上方为各自的近景；四个原生相机视图通过，材质管线拒绝数为0。报告见 `human-sanctum-assets-validation.json`、`human-sanctum-native-models.json` 和对应 profile。

本阶段接入素材与原版规则来源。生产、研究、自动施法、效果转移、变形及控制魔法的实战行为尚待接入与验收；主游戏初始场景未增加预建对象。
