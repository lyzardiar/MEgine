# 连续地表与分层悬崖

Author: MiYu

地图用 33×33 个共享顶点保存连续地表起伏，悬崖级别与坡道仍单独保存。每格双线性插值，1/16 世界单位量化，范围为 -1 至 1；旧地图缺少该字段时使用平地。`terrain4h:` 将邻接悬崖角点和 7×7 起伏顶点传给原生网格，渲染先改变顶点高度，再以共享高度场平滑地表法线；岩壁保留几何法线。相邻块采用相同高度插值，低地可降到零高度以下。

编辑器按 V 切到地表起伏页，可使用抬高、降低、平滑和平台。范围为 2、4、6，力度为 0.125、0.25、0.5。平台取笔画起点的高度，平滑读取修改前的邻域；一次拖动对应一次 Ctrl+Z 撤销。圆形笔刷轮廓贴着地面显示，水边顶点与地图外边界不受起伏笔刷影响。

高地模板用逐格收角的悬崖轮廓组织两层台地，保留东西坡道。默认遭遇战的两方基地周围 16 世界单位内保留平地，外围逐步展开确定性的起伏。建筑要求干燥、同一悬崖级别且地表高差不超过 0.25。单位、投射物、拾取射线、选中标记和攻击遮挡使用实际地表高度。地图和游戏存档保留起伏；联机协议为 23。原版所有悬崖模型、地形贴图与完整美术一致性仍未完成。

验证入口：

```powershell
node scripts/test-frost-sculpt.mjs
node scripts/test-frostbound.mjs
cargo test -p mengine-assets terrain_mesh
cargo test -p mengine-editor-host --test frost_sample
node scripts/qa-frostbound.mjs --sculpt-only
node scripts/qa-frostbound.mjs --ground-only
```

`--sculpt-only` 在独立样例副本中使用平地起伏的高地模板、关闭 AI 并放置一名友方英雄。通过原生 QuickJS、Agent 指针和键盘输入检验笔刷拖动、整笔撤销、负高度拾取、地图保存读取、英雄登坡和游戏存档恢复；测试夹具不会写回游戏地图。人工物理输入和音频聆听未在该自动化中验收。

实拍：[默认地表](relief-ground-highland.png)、[连续起伏](sculpt-sculpt-hills.png)、[英雄登坡](sculpt-sculpt-ascent.png)、[凹地笔刷](sculpt-sculpt-depression.png)。验收记录见 [阶段验证](terrain-sculpt-validation.json)。
