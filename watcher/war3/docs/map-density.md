# 地图资源与野怪密度接口

地图脚本的 `SetResourceDensity`／`GetResourceDensity` 和 `SetCreatureDensity`／`GetCreatureDensity` 已连接会话配置；两项独立保存输入的低八位，供 config 与后续脚本查询。原版 1.27 `Game.dll` 分别在配置偏移 `+0x4a`／`+0x49` 写入和读取字节；四个入口的只读指令保存在 `tmp/docs-artifacts/war3/map-density-native.txt`。

当前缺省值设为零，尚未确认原版初始化值；这两项只提供配置与查询，没有实现按密度自动生成资源或野怪。待集中验证常量／超出范围的低字节、config 和主流程查询、地图切换、局域网同步、原版初值与地图生成语义；新增断言尚未编译或运行。
