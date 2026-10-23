# 原版地图装饰放置数据

Author: MiYu。

`scripts/warcraft_doodads.py` 读取经典 `war3map.doo`，已接入 `import-frost-original-map.py`。导出的 `map.json.doodads` 保存完整记录，`coverage.doodads=decoded`；缺失成员时值为 `null`，覆盖状态为 `absent`。输入地图保持只读，源 DOO 和完整 MPQ 原件、摘要及读取器版本均随导出保留。

## 字段与边界

- 支持版本7和8，保留子版本，不将7/11改写为7/9。使用本机1.27的经典记录布局，尚不支持Reforged的skin扩展。
- 普通记录保留四字节ID、源变体、XYZ、弧度角度、XYZ非均匀缩放、完整flags字节、life字节及有符号editorId。读取时不做地图缩放、坐标归一化、模型替换或生命值裁剪；普通装饰的life=255仍保留255。
- 版本8另外保留无符号itemTable、嵌套itemSets、物品四字节ID及概率。`0xffffffff`不丢失，也不在读取阶段执行随机掉落。
- 地形装饰保留独立尾部版本、ID、未知32位字段及两个无符号网格坐标。与普通装饰的世界坐标分开保存。
- 未知主版本、错误标识、负数／越界计数、任意字段截断、非有限坐标及额外尾部均拒绝。严格读取不会静默删掉无法解释的记录。
- `war3mapUnits.doo`是另一种记录布局，仅保留原件。对象覆盖`war3map.w3b/.w3d`也保留原件并标记`preserved-unparsed`；后续场景消费必须先处理实际存在的覆盖，不能只使用默认SLK。

当前读取器是原版放置数据消费基础。[装饰场景生成器](original-doodad-scene.md)已将源模型、采样动画与发射器加入独立地形项目，B001 两图生成与 MEngine 原生检查通过，原版行为及画面对照仍待补齐。可破坏物交互、砍伐、碰撞、掉落、保存及联机仍需接入，不把读取通过等同于原版运行一致。

## 来源与验证

格式依据[固定GitHub提交及MIT许可](../../../third_party/warcraft-map-format/README.md)。`test-warcraft-map-reference.mjs`调用原TypeScript解析器，buildVersion固定127，逐字段核对并独立重建完整DOO字节。全局天气四字节ID在有／无符号读取器之间按位比较，不改变导出值。

2026-10-23，本机安装的298张地图全部完成DOO逐字节重建：1,167,556条普通放置、258条地形装饰，0拒绝、0缺失；版本组合为7/9共89张、7/11共2张、8/11共207张。此检查独立提取DOO，所以不受两张Download DotA的W3I截断影响；完整地图读取仍保留原有的296通过、2拒绝结论。

| 地图 | DOO版本 | 普通放置 | 源树木 |
| --- | --- | ---: | ---: |
| Booty Bay | 7/9 | 2,011 | LTlt 1,411 |
| Amazonia | 8/11 | 2,452 | VTlt 1,601、LTlt 199 |

两图及非空掉落／地形装饰合成样例通过独立读取器的全部字段比较和字节重建。5组Python测试通过，覆盖两个版本、每个截断位置、保留位、任意四字节ID、非均匀缩放、空表和嵌套掉落、非法输入、真实MPQ导出、对象覆盖原件保存与来源摘要；既有9组地图测试继续通过。

`probe-frost-rea-doodads.mjs`对摘要为`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`的Game.dll运行真实REA MCP。`0x6f7537c0`返回`.doo`扩展名；`0x6f1c0800`和`0x6f1cce20`附近列举`.doo/.w3b/.w3d`；`0x6f6bf922`将`Doodads\Doodads`传给`0x6f6c0790`，`0x6f6a4817`附近引用`units\DestructableData`并调用`0x6f17c020`。这些证据定位扩展名和表引用，不用于断言二进制字段布局、具体加载语义或原版实际运行行为。

## 复现与后续消费

### 生命状态分支

REA 的 `node scripts/probe-frost-rea-doodads.mjs --life` 对同一固定 Game.dll 提供3组新增证据：DOO生命字节读取、可破坏物生命状态、按名称选择Death及定位末帧。`0x6f7571c0` 读取生命字节，`0x6f74eaa0` 将其传给 `0x6f75c5f0`；后者先检查对象分类位 `[entity+0x87]&1`，普通装饰物不进入生命修改。可破坏物百分比限制在0到100，归零时由 `0x6f7592a0` 的状态3选择 `death`，并向 `0x6f6f1f50` 传末帧标志；后者按序列长度调用 `0x6f12f500`。

`python scripts/probe-frost-rea-doodad-life-cpu.py` 在 Unicorn 中执行以上原始机器码，1,024组输入通过：两种对象类别、初始生命0／100、全部256种生命字节。它执行实际状态和命名动画分支；外部模型元数据、路径／注册／纹理更新和Stand变体选择使用桩，不启动原游戏。故只证明该分支，不能证明flags可见性、随机动画调度或渲染一致。依赖沿用 `tmp/docs-artifacts/frost-siege-engine/dependencies` 中的 pefile／unicorn；更换DLL必须重新定位地址及核验摘要。

生成器据源SLK类别处理生命：普通装饰物即使life=0仍保留Stand动画；死亡树木使用Death末帧。`python scripts/test-frost-doodad-life.py` 从Booty Bay原件派生测试地图，通过真实MPQ导出与生成路径核对。当前八条放置覆盖生命和flags：零生命风车5部件保持Stand和动画分组，死亡树2部件固定Death末帧，活树2部件保持Stand，并核对各父实体active。夹具只用于定向验证，不替代原地图展示。当前生成及原生检查通过，详见[场景说明](original-doodad-scene.md)；生成结果在 `tmp/docs-artifacts/warcraft-map-tests/life-fixture-79t499fs/result.json`，初版三条放置结果仍保留在 `life-fixture-00_e69ab/result.json`。原DLL生命执行结果为 `tmp/docs-artifacts/warcraft-map-tests/doodad-runtime/life-cpu.json`，REA证据为 `tmp/docs-artifacts/frost-original-doodads/doodad-life-*-rea.json` 与 `doodad-death-seek-rea.json`。

### 放置标志分流

`node scripts/probe-frost-rea-doodads.mjs --flags` 对上述固定Game.dll提供两组证据。入口 `0x6f751980` 通过 `0x6f6d5790` 查询源类型表：非可破坏物返回普通模型路径；全局 `0x6fbed448` 非0时也返回该路径。模式为0的可破坏物先检查flags&1，为真走普通路径；否则flags&2为真时经 `0x6f7518a0` 调用 owner+0x110 的创建回调，两位均无时不创建。回调封装把flags&4传入heightOverride。写回 `0x6f75b6f6` 根据区域判定 `0x6f72d8e0`、虚函数+0x4c和实例+0x84的值8分别生成这三位；flags不是统一可见性掩码。

`python scripts/probe-frost-rea-doodad-flags-cpu.py` 执行原分流和回调封装机器码，模式0／1、两种类别、全部256种flags共1,024组通过。源表membership、角度转换和最终创建回调使用桩；回调只记录参数。模式0结果与生产 `placement_kind` 一致，模式1均返回普通路径，heightOverride保留值4对应位，原DLL摘要不变。证据位于 `tmp/docs-artifacts/warcraft-map-tests/doodad-runtime/flags-cpu.json` 及 `tmp/docs-artifacts/frost-original-doodads/{rea-flags-summary.json,doodad-flags-*-rea.json}`。依赖和更换DLL约束同生命分支。

生成器以模式0消费类别和flags，保存 `decorative`／`destructable`／`suppressed`；仅最后一种父实体设为inactive。类别只描述预览创建路径，不代表完整原版创建、模式初始化、碰撞、寻路或交互已经执行。八对象夹具与MEngine原生像素验证覆盖此消费路径，完整原版运行仍待对照。

```powershell
python scripts/test-warcraft-doodads.py --maps 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps'
python scripts/test-warcraft-map.py
node scripts/probe-frost-rea-doodads.mjs
```

重新运行[地图导出及独立格式检查](original-map-import.md)可得到包含装饰记录的新输出；已有输出目录保留，必须选择新目录。证据目录为`tmp/docs-artifacts/frost-original-doodads/`，包含`corpus.json`、`rea-summary.json`、`reference-check-report.json`及`exported/`。合成样例由`test-warcraft-doodads.py`中的`fixture(8)`写入地图测试MPQ，再通过正常导入器导出。

后续消费使用[装饰场景生成器](original-doodad-scene.md)。Booty Bay所需模型在既有本地转换库均有条目；Amazonia的`BubbleGeyserSteam`和`BubbleGeyser`属于纯粒子模型，使用发射器路径；两图完整生成与MEngine原生检查已通过，原版粒子求解器仍待对照。两图均没有W3B/W3D覆盖成员；含覆盖的其他地图需先实现覆盖解析。
