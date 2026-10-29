# 能力名称转换 native

`AbilityId` 和 `AbilityId2String` 接入脚本 VM：按经典客户端的能力名称映射缺省行为分别返回整数 0 和 JASS null 字符串。null 与空字符串保持区分；脚本中的四字符 rawcode 和 `GetSpellAbilityId` 沿用既有整数语义。

本机 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，REA 证据 `ev_6fcacd237abec68ac44f942e99ebd724d6e577d2d24b33f85e47b2b32f577302` 将 native 绑定至 `0x6f1d9b60` 和 `0x6f1d9b30`；`ev_dba1bd6051e7d9acf24389f03812aa447f817e9b122c60bc1dc95d8efbc7aa0f` 表明未命中时分别返回 0 和 null。经典社区资料 [Jassdoc](https://lep.nrw/jassbot/doc/AbilityId) 及 [旧版 native 说明](https://www.hiveworkshop.com/threads/list-common-j-natives-that-do-nothing-are-useless-are-broken.199627/) 报告这两项在通常游戏环境中返回上述值；静态入口本身不能证明所有版本和所有可能的名称注册均为空。

集中验证固定版原生与客户端的 null／空／普通名称／rawcode／自定义能力及未知整数输入，并检查地图脚本对 null 字符串的比较；若发现可注册的名称映射，应实现真实映射而非保留固定返回。
