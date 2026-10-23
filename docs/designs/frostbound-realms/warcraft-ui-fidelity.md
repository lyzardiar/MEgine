# Warcraft III 界面还原

## 来源与更新

界面以本机 Warcraft III 的 FDF、skins、字体、BLP、MDX 为依据。源游戏目录为 `E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`；读取顺序为 `War3Patch.mpq → War3xLocal.mpq → War3x.mpq → war3.mpq`。原文件保存在样例 `SourceAssets/WarcraftUI/`，不修改源字节。`warcraft-ui-sources.json` 记录每个源成员的档案、路径、SHA-256，以及 PNG、字体、脚本摘要与八片边框切分。

背景与两侧装饰复用 `asset-library/warcraft-iii/remaining-ready/` 中已转换并与原 MPQ 成员核对的资源。`warcraft-menu-background.json` 保留模型来源、原始相机、五盏灯、材质状态、各页动画索引和所有复制文件的摘要。字体 `Warcraft-Master.ttf` 来自 `Fonts/dfst-m3u.ttf`；游戏资源的原权利归属不变，不适用工程其他资产的 CC0/OFL 标注。

维护入口：

```powershell
python scripts/import-frost-warcraft-ui.py --game '<游戏目录>'
python scripts/import-frost-menu-background.py
node scripts/restore-frost-warcraft-ui.mjs
```

前两项负责可复现导入，拒绝覆盖已被手动修改的生成资源。第三项明确应用原版布局到 UI prefab；它会覆盖对应控件的布局，请将需长期维护的布局变更同步至脚本。日常直接编辑 prefab 后只执行 `node scripts/sync-frost-ui.mjs`，该命令保留既有实体 ID，更新场景、控件注册与脚本。完整样例构建仍通过 `build-frostbound.mjs` 读取 prefab。

## 坐标与呈现

FDF `.8 × .6` 映射到 `960 × 720`，每源单位 1200 像素，字体、按钮、命中区域等比缩放。宽屏扩展两侧，竖屏扩展上下，不拉伸原版菜单画面。该布局策略不等于已经证明原客户端所有宽屏投影行为。

标准按钮来自 `StandardTemplates.fdf` 的底座、普通／按下／禁用纹理；Esc菜单使用独立的 Human/Default 皮肤。通用 Sliced 图保留角尺寸，中心与边缘会拉伸；FDF原始背景重复铺贴的逐像素一致性仍待验。字体颜色与阴影取自原定义。

原主背景只播放 `Stand`，33.333 秒、12 Hz，避免跨入其他镜头序列；海水的30张纹理切换、UV动画和geoset颜色/透明度随原材质轨道更新。两侧装饰按页面选择 `MainMenu Stand`、`SinglePlayer Stand`、`SinglePlayerSkirmish Stand`、`Options Stand`，保持非循环段末帧，不在空闲帧重复提交136个网格状态。模型和专用相机在进入对局后停用。

两侧装饰的正交投影由源坐标推导，仍需原客户端/REA运行时对照。原模型五盏点光已接入；引擎缺少原 `attenuationStart`，且当前离屏渲染共享全局灯光，不能认定光照等价。33个背景粒子、6个billboard节点及动画Logo仍待接入。

## 逐屏状态

| 界面 | 当前实现 | 仍需还原或核验 |
|---|---|---|
| 主菜单 | 原字体、按钮底座与四态、原标签及FDF几何、原背景模型、原静态Logo | 两侧层投影、动态Logo、粒子、完整原光照；Battle.net及服务器选择禁用 |
| 单人 | 战役、装载存档、观看录象、自定义战役、自定义游戏的原顺序；移除地图编辑器菜单项 | 玩家档案交互、战役、录像、自定义战役页面；未接入入口禁用；编辑器仍可从开发快捷键F4进入 |
| 自定义游戏 | 原列表／队伍／地图详情分区与开始／取消位置，保留任意地图文件导入及真实进度 | 原目录树、列表行风格、玩家槽、完整高级选项和详细地图信息布局 |
| 选项 | 三页88节点按原FDF继承／SetPoint生成；原滑条、勾选框、下拉底座、输入框；音量／静音、滚屏、生命条和高级提示；确定保存／取消恢复 | 灰色控件的图像、声音驱动、队形、录像等能力；键盘焦点；原客户端字体排版对照及对局内Esc选项面板 |
| 暂停 | 原Human石框、金边按钮及FDF排列，快捷键、保存、装载、返回；选项返回保留对局 | 其他种族皮肤、保存／装载浏览器、原帮助与提示面板、独立暂停语义 |
| 对局HUD | 原Console资源基础上使用原字体，任务／菜单／盟友／聊天四槽 | 盟友／聊天完整面板与功能，其他细节逐项原版对照 |
| 局域网／房间 | 保留现有联网能力并接入原字体／按钮素材 | 原局域网页、创建房间和玩家槽布局；不将其标作Battle.net |
| 鸣谢／退出／重命名／提示 | 保留现有功能并使用原字体 | 对应原版页面、交互和边框；工程来源说明保留真实署名 |

此表持续跟进；资源来自原版不代表所有界面已经1:1完成。

## 验证

`test-warcraft-ui-import.py` 覆盖 BLP1 alpha 0/1/4/8、截断与边框合成。`test-frost-warcraft-ui.mjs` 检查原按钮尺寸、字体、禁用／隐藏入口、两个长宽比下点击、音量设置、暂停→选项→F10返回的对局保留。`test-frost-map-session.mjs` 与 `test-frost-map-import.mjs` 复用既有地图流程定向检查。

`qa-frost-warcraft-ui.mjs` 复用现有Release程序，截图并检查六个界面/尺寸和菜单导航；`--main-only` 只复验主菜单视觉。原始截图、报告和失败记录在 `tmp/docs-artifacts/war3-ui/`，不提交到docs。详细批次状态见 `docs/testing-batches.md`。

## 原版选项页

`extract-frost-warcraft-options.py` 从保留的 OptionsMenu、StandardTemplates、GlobalStrings 与 MasterFont 生成 `warcraft-options-layout.json`；三页共88个显式节点，记录继承、原锚点、菜单条目、滑条范围及来源摘要。无指定尺寸的文字使用原字体的Pillow度量；原客户端的行框、基线、字距仍需对照。布局没有手工补偿偏移。

`restore-frost-warcraft-options.mjs` 将布局写入Options prefab的三页根节点，`game/warcraft-options.js` 控制显示与设置事务。音乐／音效支持拖拽、越界钳制、释放停止、独立静音及恢复原音量；设置在确定时保存，取消／Escape／F10恢复进入前的值。键盘／鼠标边缘滚屏速度影响实际相机；生命条可切换为选中、悬停或Alt时显示；高级工具提示开关控制说明正文。导入地图自有脚本的相机／音频仍需独立接入这些设置。

没有对应运行能力的选项保持原位置并禁用，下拉与端口显示不可用；不提供虚假的图像档位或音频驱动。背景透视、底部黑区与源摄像机语义仍待核对。声音听感、系统音频输出、键盘焦点、原版逐像素对照均不属于脚本检查通过的结论。

生成链：`python scripts/import-frost-warcraft-ui.py` → `python scripts/extract-frost-warcraft-options.py` → `node scripts/restore-frost-warcraft-ui.mjs`。日常prefab修改使用 `sync-frost-ui.mjs`。
