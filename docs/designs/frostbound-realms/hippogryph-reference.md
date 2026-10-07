# 原版角鹰兽骑乘测量入口

Author: MiYu

骑乘/卸载的实现依赖原版 Acoi/Adec 对生命与单位对象的实际转换。本次提供可运行的自动测量地图脚本及严格结果校验入口；尚未取得原版运行输出，尚未接入新的游戏玩法。

`scripts/warcraft-hippogryph-reference.j` 自动设置 Reht，创建一名弓箭手和一只角鹰兽，在白昼冻结时间后依次观察四组源单位：满血、100/200 生命、200/100 生命和角鹰兽端发起命令。每组保存原对象 ID、类型、生命、坐标、飞行高度、命令、隐藏状态、归属和人口，记录 0.1 秒接近过程、6 秒后的骑士、骑士降至 300 生命后的即时与 31 秒后卸载命令、卸载后两种单位。整数类型与 handle 使用 I2S 保留精度；不能先转 real，否则大整数类型 ID 会丢失精度。

脚本探测 coupletarget、coupleinstant 和源命令 decouple 的接受结果；命令名称和成功后的行为仍以运行输出为准。失败命令、未转成 ehpr、人口不保持 4、缺项、重复记录、错误标签或地图哈希均无法通过校验。即时卸载失败时，在源 30 秒冷却后再试一次。采样只用于生命、对象身份、人口及接近观察，不推导 buff、DOT、武器冷却、死亡或无法落地时的行为，也不从四组样本宣称一个通用生命转换公式。

## 准备和检查

```powershell
python scripts/create-warcraft-rule-reference.py --script scripts/warcraft-hippogryph-reference.j --jass-checker <pjass.exe> --tag <unique-tag> --output <fresh-output-directory>
python scripts/analyze-warcraft-hippogryph-reference.py <measurement.pld> --receipt <receipt.json> --output <analysis.json>
```

创建器从安装目录 Echo Isles 复制地图到新的忽略目录，不修改原始地图；MPQ 每个条目均经独立读取器回读。原版 common.j、Blizzard.j 从实际安装包提取，记录对应归档和 SHA-256；可选 pjass 同时校验语法与类型，失败时不生成地图。符号检查现在同时覆盖表达式中的 native 调用，而不仅是 call 语句。

已准备地图与路径见 `hippogryph-reference-validation.json`。采用 pjass 官方 release-2026-06-15，下载 URL、文件大小与 SHA-256 已记录。两份脚本均经实际 checker 通过：新骑乘脚本 208 行，既有 Druid/Dryad 脚本 302 行；这不是原版运行验收。合成数据门禁测试 6 项、既有门禁测试 6 项、MPQ 写入器测试 3 项通过；合成数据不作为玩法证据。

原版 War3 PID 140664 响应，但未证明加载任何测试地图。未关闭、重启或启动第二个原版进程。当前没有对应 .pld 测量文件；需在可操作原版窗口的环境里载入测量地图，约三分钟后收集输出。输出写到生成器 receipt 的 result 路径及游戏 CustomMapData 下的带标签 .pld 文件。匹配文件还须确认其实际运行构建、地图及 tag；不能将响应进程或编译通过当作生命转换行为已验证。

全游戏复刻目标仍未完成。下一步取得原版观察并核实尚未覆盖的状态转移，再接入 Reht 研究和真正的骑乘/卸载。
