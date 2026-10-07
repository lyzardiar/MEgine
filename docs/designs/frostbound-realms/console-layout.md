# 经典控制台布局

作者：MiYu

游戏界面使用原版 `UI/FrameDef/UI/ConsoleUI.fdf` 的九块控制台贴图定义，包括宽高、纹理区域、上下与左右锚点。人族、兽族、暗夜精灵和亡灵分别使用源 BLP 贴图、顶部按钮状态、资源图标、时钟边框与物品栏盖板。命令栏保留 4×3 排列，物品栏保留 2×3 排列；头像、生命与法力条、单位名称和属性位于控制台对应区域。

游戏 Canvas 使用 960×720 参考分辨率，FDF 的 .8×.6 坐标按统一 1200 倍投影。根 RectTransform 铺满视口，子控件的锚点使用实际画布宽高，缩放取宽高比的较小值。边缘控件分别锚定左右及上下边界，信息面板使用源图的横向九宫格延展。命令、物品、资源和编队图标保持正方形，小地图保持 164×164；英雄与编队血条沿用对应头像的实际宽度。点击区域读取同一 RectTransform，小地图标记、资源和血量填充使用对应控件的局部坐标。编辑器命令区按面板实际宽度排列，标签在按钮内换行。

`console-frame-sources.json` 记录从本机 Warcraft III 有效 MPQ 层提取的 FDF、MiscUI、war3skins、按钮与资源图标，包含原始路径、归档名及 SHA-256。`console-sources.json` 签名生成器、上述来源记录、资产库来源记录、24 份原始控制台贴图及全部生成输出。源文件字节原样保存在 SourceAssets；资产版权沿用 Blizzard Entertainment 署名。

```powershell
python scripts/import-frost-console.py
node scripts/build-frostbound.mjs
node scripts/qa-frost-console.mjs
node scripts/qa-frost-menu-network.mjs
node scripts/qa-frostbound.mjs --menu-only --deterministic-input
```

独立重生成的 105 个文件字节一致；手工修改输出后，导入器拒绝覆盖且其他文件不变。24 份调色板 BLP 的解码与已有独立转换结果逐像素一致。源模型比例、4,952 个资产哈希、4,672 个姿态样本以及状态、技能和建造回归通过。

四族原生控制台显示与物品点击验证通过。1280×720、1024×768、1920×1080、2560×1080 的游戏与编辑器布局通过：命令和物品图标、小地图保持正方形，控制台接缝连续，编辑器按钮位于命令面板内且不覆盖信息区。菜单、小地图、命令、保存和页面切换的原生输入通过，材质管线拒绝数为 0。宽屏截图输出为 2048×864，保持实际视口的宽高比。报告见 [原生布局验收](native-console-layout-qa.json)，画面见 [人族](console-layout-human.png)、[兽族](console-layout-orc.png)、[暗夜精灵](console-layout-night-elf.png)、[亡灵](console-layout-undead.png)、[4:3](console-layout-1024x768.png)、[16:9](console-layout-1920x1080.png)、[宽屏](console-layout-2560x1080.png)。

菜单回归已执行单人开局、地图与英雄选择、保存／载入、设置持久化、制作名单及退出取消。双原生客户端的 TCP 菜单创建、浏览、加入、准备／开局、16 秒大厅空闲及客机断线重连验收通过；主机使用兽族控制台，客机使用暗夜精灵控制台，双方材质管线拒绝数为 0。报告见 [菜单联机验收](native-menu-network-qa.json)，连接时钟与验证方式见 [联机连接计时](network-clock.md)。

本阶段完成控制台素材、布局和点击区域校准。小地图仍使用当前地形摘要，原版昼夜动画、完整英雄属性与全部界面交互仍需继续完善；物理鼠标和音频未在上述 Agent 输入验收中验证。
