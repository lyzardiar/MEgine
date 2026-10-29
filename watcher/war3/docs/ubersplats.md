# 地表特效 Ubersplat

`CreateUbersplat` 从挂载归档的 `Splats/UberSplatData.slk` 读取类型、纹理、范围、出生／保持／消退时间、三段颜色及混合方式，创建独立 ubersplat 句柄并使用图像的异步纹理读取、地形贴合、迷雾与 Direct3D 绘制；`DestroyUbersplat` 清理句柄和绘制状态，`ShowUbersplat`、`SetUbersplatRender`、`SetUbersplatRenderAlways` 控制可见性，句柄可存入 hashtable。资源只在内存读取，不改写原安装或解包地图。

会话固定步进推进起始→中间→结束颜色，脚本 RGBA 与源颜色相乘；forcePaused 在出生后保持中间状态、Finish 开始消退，noBirthTime 从中间状态开始，Reset 重新开始并恢复创建时的暂停设置。混合支持源表的 Blend／Add／Mod／Mod2X／Alpha Key。地图暂停冻结模拟时钟；播放完毕的句柄保留到脚本销毁。以上时间与暂停规则、Scale 按半径形成方形地面图像、透明和排序均为当前实现，尚需原版实机对照。

本机 Warcraft III 1.27 的 War3Patch.mpq 中源表有 53 条类型，SCTP 指向 `ReplaceableTextures/Splats/TeleportTarget.blp`、Scale 200、BirthTime 0.2、PauseTime 0、Decay 5。原表 INIT 行的 Sound 为 INIT（本机常见声音表无此标签），其余 Sound 均为 NULL；当前将 INIT 作为占位值，非空 Sound 放入有界本地呈现队列，由 GameView 按源标签和地形位置播放，资源或设备错误记录日志，不中断地图脚本。播放时机、空间参数及原版一致性待验证。类型不存在返回空句柄；单会话总图像及特效各限 8192，异常值拒绝。

阶段集中验证 DotA 回城和技能地表特效、随机颜色／透明／地图覆盖、图像显示与迷雾/水面／暂停/完成/重置/销毁、同帧回调/hashtable、每类 BlendMode、GPU 设备恢复与切图释放及多实例性能；原版颜色插值、尺寸、顺序、同句柄生命周期、播放完毕后的语义和音效需对照。Win32 Release 客户端增量编译通过，未运行玩法验证。
