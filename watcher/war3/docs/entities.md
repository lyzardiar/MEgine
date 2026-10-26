# 地图对象初始化

对象定义和实体状态由独立C++客户端持有。原资源只读，UnitUI、UnitData、UnitBalance、UnitWeapons、UnitAbilities、ItemData及UnitMetaData从归档直接读取；单位/物品Profile保留四字符ID大小写。地图w3u/w3t支持版本1/2，保存原对象/自定义对象、类型化修改和终止标记，按原对象修改后自定义继承的顺序应用。metadata的slk/field/index决定目标，未映射修改保留原记录与计数。

格式与字段映射复用仓库已有 `crates/mengine-assets/src/warcraft_map/objects.rs`、`warcraft_definitions/tables.rs`、`warcraft_definitions/overrides.rs` 的分析成果，运行不依赖Rust。公共MPQ或地图覆盖中的源表优先级沿用Archives；定义按会话需要加载，不写派生资产。

CreateUnit/CreateUnitAtLoc创建持久单位，读取源模型、名称、生命/魔法、移动速度、警戒范围、人口与等级；CreateItem读取源模型、名称、生命、次数和等级。句柄与会话单位/物品表关联，位置、朝向、所有者、资源量和状态native查询/修改同一对象；分组引用实际单位，RemoveUnit移除分组和会话表引用。单位/物品的可见、选择、暂停、无敌和路径开关先保留为状态，渲染/规则消费者继续接线。

AddWeatherEffect从TerrainArt/Weather.slk获取真实天气定义并保存区域；EnableWeatherEffect和RemoveWeatherEffect修改/销毁同一实例。天气粒子尚未接入渲染。

CreateSound/CreateSoundFilenameWithLabel保存真实WAV/MP3成员和参数。数字声音按开始播放时申请Miles声音，避免地图批量声明声音时立即占满物理声音名额；非空间播放沿用已有音量/渐变/释放，支持loop与数字采样率pitch。GetSoundDuration可用脚本指定时长或实际解码长度。声音表参数、位置、距离、速度、锥角与EAX请求保留；空间声音在监听器/混音器接线前明确阻止播放。声音标签变体、3D/EAX、完整声道/资源策略与原版时序仍待实现或核对。

## 当前边界与待测

首批只做产品编译/静态检查。接续已在BootyBay开发复现中创建65个源定义单位，完成原main及250ms早期步进，见 `script-events.md`。w3u/w3t继承边界、天气、寿命/切图、完整声音/数值、多个地图持续初始化仍在阶段A队列；旧三图main失败位置属于e073a7d验证版本，不代表当前范围验收。

实体仍缺模型显示、完整属性/能力、库存、路径/碰撞、移动/战斗、死亡事件与模拟调度。单位位置当前只做世界范围处理；不将位置写入视为已完成寻路。对象覆盖只含w3u/w3t，w3a/w3h/w3q/w3b/w3d及完整放置仍待实现。名称本地化、全部metadata/profile字段和变体列表需要后续消费与验证。

阶段门槛按 `implementation-roadmap.md`：持续补齐地图主函数、调度、渲染、操作与载入，再合并测试修正。未知native保持失败，不以接口数量或编译通过代表可玩对局。
