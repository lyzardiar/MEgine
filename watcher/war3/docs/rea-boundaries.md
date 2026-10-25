# 原版接口与行为依据

对照安装版本为1.27.0.52240，原件摘要见 `profiles/classic-1.27.json`。Game.dll仅做静态分析，不被新客户端加载。REA 6.5.0 通过项目固定的 Rizin 0.8.1 读取原件，原始证据保存于 `tmp/docs-artifacts/war3/rea/`，不作为运行资源提交。

## IJL JPEG

`ijlInit`、`ijlFree`、`ijlRead`采用stdcall，正常返回分别为0x60032831的ret4、0x60032bf8的ret4和0x60033784的ret8。JPEG_CORE_PROPERTIES的内部区从+0x58开始；Game.dll的blp.cpp包装函数0x6f7beed0将属性区放在ebp-0x4e6c，至ebp-4的cookie前，总共0x4e68字节。新实现用静态断言核对前缀偏移和存储大小。

原调用0x6f7bf098–0x6f7bf0d6设置DIBChannels/JPGChannels=4、DIBColor/JPGColor=255、JPGSubsampling=0，再调用ijlRead(mode=3)。新实现保留BGR(A)原始分量，按BLP alpha标记决定透明度。3分量由库参数校验支持，仍需独立样本验证，不能套用CMYK到RGB转换。

证据：`game-blp-jpeg-wrapper.json`、`ijl-independent-core.json`、`ijl-independent-tails.json`、`ijl-parameter-validation.json`。

## Miles

从固定mss32.dll加载stdcall导出，44100Hz、16bit、双声道。原版主菜单MP3从MPQ读入内存，内存归属保持到sample释放之后。先结束并释放sample，再关闭driver和Miles，最后卸载DLL。原版DLL从指定绝对目录加载；不存在的音频设备或解码器写入诊断日志，客户端可静音运行。MP3播放和听感分别验收。

## 后续对照

模拟步进、随机数、句柄、计时器、命令顺序、JASS执行、存档和回放尚未取得完整行为证据，保持验收矩阵待实现状态，不能以格式解析或窗口运行代替游戏规则验收。
