# 条带、闪电与共享高度

独立客户端已连接RIBB条带、原LightningData配置、脚本闪电句柄及闪电链/治疗波的闪电画面。产品和扩展消费者已编译，三份新增源条带模型、四种闪电配置/纹理及两组高度数据检查通过；GPU、完整脚本行为、原版精度和性能仍待阶段验证。

## 实际消费

RIBB保留源节点、上下高度、透明度/颜色、寿命、纹理槽、发射率、图集、材质、重力及KRHA/KRHB/KRAL/KRCO/KRTX/KRVS轨道。每个模型实例分别保留条带采样点和寿命，按源节点变换连接前后采样，消费图集、材质纹理/透明度/动画、过滤和优先级。停止发射后按实际寿命排空；纯RIBB模型也可进入资产路径。每个发射器最多4,096个采样点，离屏与长帧规则沿用现有实例策略。

LightningData从挂载资源的Splats/LightningData.slk读取，保留15种原版配置及地图覆盖：纹理目录/文件、AvgSegLen、Width、RGBA、NoiseScale、TexCoordScale和Duration。闪电使用实际端点、源纹理/宽度/分段/颜色与视野标志绘制，纹理进入后台读取/上传；脚本对象保持到DestroyLightning，技能创建的对象有独立寿命并跟随实际单位端点。删除、移动及颜色变化直接消费同一记录，typed hashtable保存真实lightning句柄。

已绑定AddLightning/Ex、MoveLightning/Ex、DestroyLightning、SetLightningColor和四个GetLightningColor接口。原能力LightningEffect的主/次配置连接闪电链、治疗波；链式零速后续命中保持进入下一模拟步，避免递归堆叠。其游戏规则和原件时序继续按既有待测项对照。

World集中保存源地形/坡道表面；渲染通过span复用该数据，GetLocationZ与闪电端点查询消费同一插值。坡道识别和低角抬高规则沿用已有渲染实现，减少重复数据及计算。这使当前查询和画面同源，原版高度量化/悬崖/坡道精度仍需对照，不代表完整动态地形已完成。

## 来源与限制

RIBB布局、发射/采样和材质参考flowtsohg/mdx-m3-viewer固定提交2ff0bc00c6363f425016e23d88c0fb2929d3b3cc，相关四个文件与SHA256已登记到根目录third_party/warcraft-model-reference/source-info.json，MIT版权和许可继续保留。更新步骤同[源粒子与特效](effects.md)。原件配置与模型保持在本机1.27.0.52240安装/地图归档中，运行不加载Game.dll，不生成解包工程。

当前闪电分段扰动、纹理滚动、技能对象持续时间的使用、跟随高度、视野边界、RIBB重力轴/图集/跨类型排序与发射质量倍率尚未得到原版逐项运行证据，需在阶段对照后修正。源配置已消费不等于这些算法已经还原。GPU画面、完整颜色/移动/销毁/失效句柄行为、冷首次技能、长时间/多实例/切图与预算也尚未验收。PREM、事件型SPN/SPL/SND、子附件模型、完整灯光/雾与声音仍需实现，完整客户端保持未完成。

## 本次必要检查与阶段入口

必要编译：`cmake --build --preset release --target war3 war3_effects_tests war3_spell_tests --parallel 8`。新增11项native声明与原common.j核对；现有Save/LoadLightningHandle复用真实动态类型。

为确认新增记录进入实际消费者，仅执行`war3_effects_tests <data-root> <log> --ribbons`：DeathCoilMissile解析3个RIBB，FanOfKnivesCaster解析16个，FrostNovaTarget解析4个；CLPB/CLSB/HWPB/HWSB四种配置及两份共享源纹理通过；平滑插值/坡道两组独立期望高度通过，无Game.dll/GPU。原始记录保存在tmp/docs-artifacts/war3/ribbons-lightning/。未重复此前PRE2检查，未运行专项脚本或三图/性能回归。

扩展war3_spell_tests已包含闪电源字段/端点、typed storage、颜色、移动、视野标志与销毁断言，执行仍在阶段队列。阶段合并RIBB出生/持续/停止/排空、共享模型多实例、图集/材质/重力、闪电原纹理/分段/宽度/扰动/寿命、两种坐标接口/单位跟随、全部颜色分量/失效句柄/可见性、地形/坡道/边界高度及17技能和三图画面、持续切图/内存/CPU/GPU表现。
