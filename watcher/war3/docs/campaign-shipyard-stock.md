# 商店默认单位库存

单位商店读取 `Sellunits` 时，对源对象表不存在的单位保留空槽并继续加载其他单位；空槽不生成购买按钮，不作为有效库存销售。有效单位的库存、补充与购买沿用原有流程；地图物品列表和脚本动态添加库存继续按原有规则处理。

固定版 `Game.dll` 中 `CAbilitySellUnit` 虚表的初始化函数 `0x6f3fe8d0` 读取 `sellsUnitIds`，对每项调用 `0x6f66ec30` 检查对象表；返回零时跳到循环的下一槽，见 `tmp/docs-artifacts/war3/tft-opening-1031/sell-unit-methods.txt` 和 `sell-unit-validation.txt`。

资料片 `NightElfX02.w3x` 的 `nshp` 船坞出售 `edes,etrs,ndes`；地图覆盖了 `ndes` 的价格和人口，安装中的公共单位表却没有 `ndes` 原型。此前该无效条目使船坞创建中止；当前不会构造替代舰船。对象表和地图覆盖检查记录于 `tmp/docs-artifacts/war3/tft-opening-1031/ndes-archives.log` 与 `nightelfX02-overrides.log`。

待集中验证：船坞商品与原版窗口、空槽前后有效商品、库存与购买、空槽计数上限、地图覆盖和动态商品增删；完整第二章与实际玩家操作仍待实现或验证。
