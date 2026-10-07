作者：MiYu

建筑保留源网格的相对体量，渲染使用统一源坐标转换与 UnitUI.modelScale。主城、农场、塔各自使用原始包围盒，生命条随实际模型顶部定位。人族侦察塔使用 HumanTower 的基础阶段，箭塔及通用人族防御塔使用 Upgrade First 阶段；箭塔攻击复用原版 Stand Upgrade First Ready Attack 动画，不会显示炮塔阶段的几何体。两种塔的原版 modelScale 均为 1、选择比例均为 2.5，世界缩放为 2。头像沿用既有塔图集切片。

导入器支持 `--keys` 定向更新。已导入的其他模型、工人活动和古树拔根条目，以及签名资产保持不变；选中基础模型时，其新建活动或拔根条目也执行原生姿态包围盒计算。独立工程已验证 RealWorker、三个工人活动和 WildwoodHall/Uprooted 的 nativeStand 数据，其他条目及产品目录不变。

新增 ClassicGlaiveThrower、ClassicNightArrow、ClassicMoonGlaive、ClassicGlaiveMissile，包含 98 个新增文件。原始 MDX、BLP、动画、材质和 UnitUI 比例沿用资产库来源。133 次新资产原生 GLB/pose 加载通过，5,125 个运行资产签名通过。投刃车的 modelScale 为 1、selectionScale 为 3。这些条目已进入模型目录，暗夜训练、攻击投射物路由及新单位玩法仍需接入。版权和许可沿用原来源记录，不能将这些资产视为 CC0。

MPQ 读取支持 PKWARE implode 标志与压缩掩码 8，使用固定版本 zlib v1.3.1 的 blast。上游来源、SHA-256 和许可证保存在 third_party/blast/source.json 与 LICENSE。六项测试覆盖原始向量、输出限额、截断、单块和分块读取、原样存储及非法分块偏移；本机 War3Patch.mpq 的 HumanUnitFunc、NightElfUnitFunc、AbilityData 三个实际读取均通过。

```powershell
scripts/build-warcraft-blast.ps1
python scripts/test-warcraft-mpq.py
python scripts/import-frost-classic.py --keys KingdomTower KingdomScoutTower --billboard-library E:/work/codex/worktrees/1339/MEgine/tmp/night-army/attachments --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe
python scripts/import-frost-building-scales.py
python scripts/import-frost-unit-scales.py
node scripts/build-frostbound.mjs
node scripts/test-frost-human-tower-art.mjs
node scripts/test-frost-unit-scales.mjs
node scripts/test-frost-console-layout.mjs
node scripts/qa-frost-console.mjs
node scripts/qa-frost-building-scale.mjs
```

扩展的 billboard overlay 可由 convert-frost-classic-billboards.py 使用当前 classic-sources.json 和原始节点读取器重新生成；上述 overlay 和 pose probe 是本机已验证的生成缓存。签名资产和转换代码随阶段提交保存，安装目录、缓存路径及原生二进制需要按实际环境指定。

后台启动器通过 MENGINE_AGENT_RUNTIME_ROOT 隔离配置、WebView2、TEMP/TMP，HTTP 磁盘缓存参数为 64 MiB。仅清理由本启动器生成的随机目录，保留继承的 APPDATA/LOCALAPPDATA 与游戏存档。控制台和建筑 QA 默认写入 E:/work/codex/cache/mengine/native-qa；单个控件和遥测读取使用 entity.get。验收结束后向精确 discovery PID 的唯一主窗口发送 WM_CLOSE，等待原生退出、discovery 和运行目录消失，再关闭 Node 桥接。成功的 QA 删除其独占临时工程与唯一 storageId 对应的测试存档；失败工程保留供诊断，其他存档不受影响。所有权、活跃实例、保存路径边界和其他存档保留检查通过。64 MiB 参数不代表全部浏览器数据的硬配额。

工作树位于 E:/work/codex/worktrees/1339/MEgine。当前 Codex 会话仍占用旧 C 根目录，该目录保留兼容入口，子目录指向 E。383,252 个工作树与缓存文件、231,544 个后台配置文件逐文件双 SHA 校验通过。已清理验证后的 C 副本和 1,098 个后台配置目录，前台配置保持原位。迁移与清理报告位于 E:/work/codex/migration/MEgine-1339 和 MEgine-agent-configs。

控制台报告 native-console-layout-qa.json 已通过四族游戏画面、四种分辨率的编辑器面板与实际命令输入。建筑报告 native-building-scale-qa.json 已通过四族 38 个建筑、主城三级体量、源模型血条高度，以及 Scout/Guard 两种塔的实际姿态。两轮材质管线拒绝均为 0，正常关闭、运行目录与临时工程删除通过。生产古树、自然的祝福、小精灵、商店、场景编辑器和投射物客户端回归通过；后台启动器六项测试通过。原生验收采用 Agent 输入，物理键鼠、听感及跨机器 LAN 不包含在本阶段验收内。完整复刻目标仍需继续完成。
