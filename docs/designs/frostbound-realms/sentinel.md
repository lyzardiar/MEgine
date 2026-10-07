# 原版哨兵 Owl 与净化交互

Author: MiYu。

游戏使用 Blizzard 的 `Units/NightElf/Owl/Owl.mdx`，来自只读的 `asset-library/warcraft-iii/remaining-ready`。原模型 SHA-256 为 `cfef44526635c98962dd9d1c72d2ef0bc1d6b2c267252ec49bb87b748ac27999`。保留三组动画网格、原始材质与阵营颜色、Plane01 billboard、两个采样粒子发射器，以及五个原始动画序列。实际飞行使用 Walk，停树使用 Stand；原始 Birth/Death 序列保存在资源中。

模型转换为 `(x,z,-y)/128`，使用现有世界视觉缩放 2。保留模型自身的垂直偏移；停树根节点额外应用源能力 Aesn 的 275 高度，即 `275/128*2`。不按单位身高或模型底面再次归一化。网格与粒子共享动画序列和时钟。

哨兵遵循当前可见区域，在暂停、断线等待和结算画面保留世界中的状态。加载和重连重置插值；树木损伤、消耗或净化后的同帧删除清理根节点与所有部件。渲染池首先预建 160 槽，并按实际数量追加、复用节点，支持猎手死亡后保留的哨兵超过初始容量。

萨满的 Q 净化可点击敌方停树 Owl，使用实际渲染高度投影，在同一最近目标比较中选择单位或哨兵。服务器仍校验所有权、目标可见性、停树状态、距离、魔法和冷却。有效施放消耗 75 魔法、进入 1 秒冷却，播放施法姿态和事件并删除哨兵。飞行中的 Owl 不能净化。

`engine.findEntitiesByName(names)` 从当前同步世界快照返回匹配名称的实体，最多接收 1,024 个名称；名称可重复，重名实体均返回。它只序列化命中实体，用于动态池注册。编辑器和独立播放器在顶层脚本、场景加载回调和规则帧中提供一致的初始世界；生成命令提交后，下一帧可查询新节点。

转换与复现：

```powershell
dotnet build scripts/warcraft-assets/MdxExport.csproj -c Release -p:Wc3Core=<pinned-upstream-core> -o tmp/warcraft-effects/sentinel-bin
python scripts/import-frost-sentinel.py --pose-probe <gltf_bounds.exe>
node scripts/build-frostbound.mjs
python scripts/test-frost-sentinel-assets.py <gltf_bounds.exe>
node scripts/test-frost-sentinel-client.mjs
node scripts/test-frost-night-elf-technology-network.mjs
node scripts/test-frostbound.mjs
cargo test -p mengine-script
cargo test -p mengine-editor-host named_entity_queries
node scripts/qa-frost-sentinel.mjs
```

素材证据：`sentinel-sources.json` 记录 6 个原始文件和 49 个导入输出的大小、SHA-256、转换器源码与原始库签名。专项检查验证原始转换二进制顶点/UV/蒙皮/采样动画保持不变、billboard、原始序列时长及循环属性、两个粒子发射器、逐字节重新生成，以及修改过的输出拒绝覆盖。共享资产库不写入。

原生结果与逐步骤耗时保存在 `native-sentinel-qa.json`。截图为 `sentinel-flight.png`、`sentinel-perched.png`、`sentinel-purged.png`。原生输入由 Agent Bridge 注入，不能代表物理键鼠、音频听感或跨机 LAN 验收；粒子使用采样查看器求解器，未证明与原版引擎的粒子物理完全相同。完整四族、原版战役、经典地图内容和通用编辑器的复刻仍未完成。
