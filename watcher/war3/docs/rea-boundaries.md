# 原版接口与行为依据

对照安装版本为1.27.0.52240，原件摘要见 `profiles/classic-1.27.json`。Game.dll仅做静态分析，不被新客户端加载。REA 6.5.0 通过项目固定的 Rizin 0.8.1 读取原件，原始证据保存于 `tmp/docs-artifacts/war3/rea/`，不作为运行资源提交。

## IJL JPEG

`ijlInit`、`ijlFree`、`ijlRead`采用stdcall，正常返回分别为0x60032831的ret4、0x60032bf8的ret4和0x60033784的ret8。JPEG_CORE_PROPERTIES的内部区从+0x58开始；Game.dll的blp.cpp包装函数0x6f7beed0将属性区放在ebp-0x4e6c，至ebp-4的cookie前，总共0x4e68字节。新实现用静态断言核对前缀偏移和存储大小。

原调用0x6f7bf098–0x6f7bf0d6设置DIBChannels/JPGChannels=4、DIBColor/JPGColor=255、JPGSubsampling=0，再调用ijlRead(mode=3)。新实现保留BGR(A)原始分量，按BLP alpha标记决定透明度。三分量与四分量均已通过独立常量样本检查，原始通道误差不超过2，不执行CMYK到RGB转换。

证据：`game-blp-jpeg-wrapper.json`、`ijl-independent-core.json`、`ijl-independent-tails.json`、`ijl-parameter-validation.json`。

## Miles

从固定 mss32.dll 加载 stdcall 导出，44100Hz、16bit、双声道。先将 codec 目录设置为 `<data-root>/redist/miles`，再启动 Miles；分配 sample 后调用 `AIL_init_sample`，再设置 `.mp3` 内存输入并播放。原件 `Mp3dec.asi` 的 PE32 和 SHA-256 均核对，摘要与来源见 `profiles/classic-1.27.json`。原版主菜单 MP3 从 MPQ 读入内存，内存归属保持到 sample 释放之后。先结束并释放 sample，再关闭 driver 和 Miles，最后卸载 DLL。失败时记录 `AIL_last_error`，客户端可静音运行。

Game.dll 的 `0x6f142407` 设置 redist，`0x6f142412` startup；`0x6f141d72` 初始化 sample，`0x6f141da9` 设置 named sample。原始 REA 证据为 `tmp/docs-artifacts/war3/audio/game-miles-calls.json`、`game-miles-redist-call.json`。产品探针 sample 状态为 `SMP_PLAYING=4`，位置由 12 推进至 1237ms；析构后 mss32 与 codec 均卸载、未加载 Game.dll，见 `music-product-probe.log`、`probe-init1-redist1.log`。听感与游戏音效保持待验收。

## 原版菜单来源

菜单布局与控件模板读取 `UI\FrameDef\Glue\MainMenu.fdf`、`StandardTemplates.fdf`，中文读取 `UI\FrameDef\GlobalStrings.fdf`。退出控件为 `ExitButton`，快捷键为 Q。字体来自 `UI\war3skins.txt` 的 MasterFont，当前原件为 `Fonts\dfst-m3u.ttf`。解析覆盖 IncludeFile、StringList、Frame、模板继承与单锚点布局，并限制输入量、深度和展开节点数；完整 FDF 控件能力仍待实现。

菜单三维模型为 `UI\Glues\MainMenu\MainMenu3d_exp\MainMenu3d_exp.mdx`，当前仅此场景显式启用双面绘制，普通模型沿用材质标志。原版 logo 的精确 UI sprite 比例、灯光、雾和粒子仍需继续对照；基础帧输出不等同于完整视觉还原。

## 后续对照

模拟步进、随机数、句柄、计时器、命令顺序、JASS执行、存档和回放尚未取得完整行为证据，保持验收矩阵待实现状态，不能以格式解析或窗口运行代替游戏规则验收。
