# 小地图野怪营地

小地图野怪按钮读取原版皮肤的 Active／Inactive、Enabled／Pushed／Disabled 六张纹理，并支持点击、Alt+R、原版提示和 `EnableMinimapFilterButtons`。`SetCreepCampFilterState` 与按钮共用显示状态；开关只影响营地圆圈，不隐藏中立单位自身的小地图点。

将当前非建筑、非召唤的中立敌对单位按 600 距离连接分组，缓存位置和成员；每秒检查新增、死亡、隐藏或易主并按需重建，每帧根据存活且仍属于中立敌对方的成员等级合计决定是否显示，以及使用原 `UI/MiscData.txt`／地图覆盖的等级阈值、绿／橙／红颜色和中等缩放。标记使用原皮肤的小／大营地贴图并按源脉冲比例缩放；空间网格用于分组；成员没有变化时不重复聚类。

原版 `GlobalStrings.fdf` 指明 Alt+R、三种强度和圆圈提示；`war3skins.txt` 提供按钮及营地资源；`MiscData.txt` 的 `Minimap` 段提供阈值、颜色、缩放。固定版 `Game.dll` 的 REA 证据 `ev_3c726d984ee12bcb78bd921e4fac6c56c59e2bd7a12049f7a36f103f2bf46b55` 和 `ev_acb80bfa48401c37e69dc7e9e8dd62d55b8ca5b89863828476a0d4e0a228fe35` 对照按钮锚点与尺寸。

600 距离、连通分组、初始位置、逐成员等级合计、图标大小／脉冲周期、迷雾可见性及死亡后更新属于当前近似，尚未证实与原版一致；成员变化时依据当前单位位置重建，可能改变此前的营地中心；密集自定义地图最坏情况下的分组开销仍需验证。原模型动画尚未接入，真实窗口、迷雾、动态生成、多人本地状态与性能待阶段验证。Win32 Release 客户端编译通过。

原版皮肤表的营地图标路径与安装包实际路径不同；默认路径不存在时回退到公共 MPQ 中的 `UI/Minimap/MinimapIconCreepLoc.blp` 与 `MinimapIconCreepLoc2.blp`，地图 `CustomSkin` 覆盖优先。按钮命中重叠区域优先处理野怪按钮。

接入小地图迷雾后，当前实现只在已探索区域显示营地；该规则与原版一致性待对照，见[游戏内小地图](minimap.md)。
