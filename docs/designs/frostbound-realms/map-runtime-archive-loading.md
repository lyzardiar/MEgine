# Warcraft 地图运行时资源加载调查

Author: MiYu. 2026-10-25。状态：MPQ、BLP、MDX、地图会话、地表／悬崖／水面编译及Host地形消费已实现，155–157批次已验证；游戏世界和选图入口待接入。

## 结论与边界

当前选图入口执行的是离线导入管线：把地图展开、转换成 MEngine 工程文件、发布到工程 Assets，然后运行生成的场景。它满足场景预览与编辑需求，但与原生 Warcraft 直接读取归档成员的运行方式有架构差异。后续地图运行入口应采用归档资源来源、按需读取与内存解码；离线转换保留为显式的编辑器资产导入功能。

MPQ 是支持按成员查找、读取及解压的归档，不要求先把成员导出到本地文件。StormLib 的 SFileOpenArchive／SFileOpenFileEx／SFileReadFile 读入调用者缓冲区，SFileExtractFile 是独立的导出接口；SFileReadFile.cpp 中的扇区解压也使用内存缓冲区。参考 [StormLib.h](https://github.com/ladislav-zezula/StormLib/blob/116135c27e8c0dcf8ea0a0c549a6d737ce10fc73/src/StormLib.h#L1038) 与 [成员读取实现](https://github.com/ladislav-zezula/StormLib/blob/116135c27e8c0dcf8ea0a0c549a6d737ce10fc73/src/SFileReadFile.cpp#L687)。这是接口与格式层面的依据；本次没有采集 Warcraft 进程的文件IO，不能据此承诺该游戏绝对没有任何磁盘缓存。

用户截图是地图自定义载入画面，包含“等待其他玩家”。它说明画面和进度可以由地图定义，无法单凭截图分离资源读取、脚本初始化与联机等待时间。我们的 w3i 解析器已读取 loadingScreenModel／Text／Title／Subtitle，但它们还没有构成通用地图载入场景。

## 当前实际调用链

1. sample/project.json 的 warcraft-map 指向 Python runtime-import-frost-map.py。Rust ContentImports::run 为每次选择创建 job 目录，再启动外部转换进程，通过 progress.json／result.json 交接。
2. run 计算源地图摘要，构建包含工具、公共MPQ、脚本、主场景等输入的 environment，将整个 environment 与地图摘要共同哈希为 user-v2-* 目录名。
3. 未命中时先 export_map：复制原始 w3x／w3m、写出地图成员及 map.json。随后构建地形、装饰、单位、寻路，再安装成 .mscene、.js、GLB、PNG、材质和特效文件。部分元数据／模型处理调用 dotnet 工具，输出协议也是文件。
4. 单位阶段复制已生成的地形／装饰工程；各阶段会重新读取和解析原地图、重新打开公共归档。warcraft_map.load_map 本身整文件 read_bytes，再以 BytesIO 打开MPQ。大地图因此承担多次文件读取、内存副本和序列化成本；本次没有逐阶段采样，不能把各项成本编成耗时占比。
5. prepareSharedMapAssets 将最终依赖引用改写为内容地址，公共输出发布到 Assets/WarcraftShared/v1；场景、脚本、Data 留在地图包。安装还保留原始地图、源成员和来源清单。
6. Rust ContentImports::prepare 要求已存在的工程内 .mscene 和脚本路径，project_file 通过 canonicalize 验证磁盘文件；模型和纹理路径继续调用 gltf::import／Gltf::open 和 image::open。现有 gltf_mdx 处理的是转换后 glTF extras 中的 MDX 轨道，不能视作原始 MDX 字节加载器。

关键路径：runtime-import-frost-map.py:79、114、147、157；warcraft_resource_cache.py:51、96、124；build-frost-original-doodads.py:124、151、234；build-frost-original-units.py:76、85；frost-shared-map-assets.mjs:37；mengine-runtime/src/content_import.rs:69、91、155；mengine-assets/src/gltf_import.rs:14、texture.rs:5。上述文件均在 scripts/ 或 crates/ 对应目录中。

## 已确认的问题与已有复用

| 项目 | 证据与影响 |
| --- | --- |
| 包级失效范围过大 | packageInputs 包含 runtime-import-frost-map.py 全文、部分运行脚本及 Assets/Scenes/Main.mscene。只修改进度文件错误处理也会选择一个全新地图包；与几何、纹理解码无关的改动触发重新组装。旧包被明确保留。 |
| 热缓存仍是磁盘流程 | validate_cached 重新读取原地图副本及 manifest 每个资源并逐项计算SHA256。返回后仍需从生成文件建立场景、读模型和纹理、上传GPU。 |
| 缺少常驻归档资源上下文 | 导入工作进程结束即丢失归档句柄与进程内查找表；阶段间又重新打开相同归档。没有由运行会话管理的归档字节资源来源。 |
| 命中底层缓存仍需落盘组装 | ResourceCache.member／produce 已缓存原成员和纯转换结果；SceneAssets 与单位构建器仍写 SourceAssets、模型、纹理与工程文件，单位阶段还有 copytree。 |
| 缓存缺少容量与生命周期管理 | 全局 blobs／members／derived、工程共享输出和旧地图包没有容量上限、LRU或引用回收。成功只删除本作业4个中间目录；失败／取消不走该清理，根目录日志和收据也没有保留期限。 |
| 运行缓存污染资产空间 | WarcraftShared 和 user-v* 虽被Git忽略，仍位于 Assets，可能进入工程资源扫描并生成sidecar。本机共享目录中已存在842个meta。运行时资源不应依赖这些可写sidecar。 |

不能把现状表述成“完全没有复用”：原成员按归档摘要＋规范路径复用，派生产物按配方复用，最终相同输出按内容地址复用；file_identity 已用文件身份／时间戳签名复用摘要，并非每次都重新哈希所有公共MPQ。缺陷主要是运行入口仍依赖导入管线、包级失效过宽、重复工程物化和无界保留。

本轮已有DotA记录：两次包级失效的收据均为 cached=false，但各有348次成员命中、110次纹理转换命中、109次节点元数据命中、156次annotated-mesh及156次mesh-movement命中；没有记录新的成员解包或这些派生重建。两次观察加载约11.124／11.106秒，最终同一输入指纹 cached=true 为2.316秒。该时间来自带RPC与固定步进的原生QA观察，不含整个进程启动，不是Warcraft与MEngine的严格性能对照。足以说明底层复用存在，而地图包仍被重复组装。

## 本机存储与只读验证

仅统计具体运行缓存目录，不扫描或混入所有QA工程副本；数字是逻辑文件长度，不是磁盘分配量，也不代表远程电脑。

| 位置 | 文件数 | 大小MiB |
| --- | ---: | ---: |
| tmp/warcraft-resource-cache/v1 | 16,816 | 607.438 |
| samples/frostbound-realms/Assets/WarcraftShared | 1,729 | 240.873 |
| 上述 sample 的4个 user-v* 地图包 | 1,063 | 165.850 |
| tmp/docs-artifacts/frost-map-imports | 13 | 241.767 |

同一Amazonia源摘要存在2个v2包；EchoIsles的v1完整包与v2包并存。v2单地图约6.7–7.1MiB，说明公共内容地址发布已减少地图内复制；旧v1包仍约145MiB。当前失败作业包含约222.606MiB的原地图副本及12.718MiB脚本，错误是地形转换仅接受256×256或512×256纹理。调查中没有删除这些文件。全局blob与工程共享目录中，至少106个内容摘要相同的文件被分别存储，约8.749MiB；其他不同格式中间产物不能直接当作相同字节重复。

内存读取探针用现有MPQ实现打开DotA及4个公共MPQ，读取war3map.w3i、scripts/war3map.j、Footman.mdx、BTNFootman.blp，BLP在内存解码成64×64 RGBA；没有导出资产文件，也未创建游戏世界。地图大小8,296,502字节，探针累计从地图读取1,533,766字节（含1MiB头部探查及归档表）；读取支持偏移的归档流即可，无须先复制整张地图。本次仅验证字节读取／一种纹理，未验证完整MDX渲染、全部压缩变体、联机或完整地图启动。

原始证据与探针位于 tmp/docs-artifacts/map-loading-audit/：storage.json、receipt-comparison.json、memory-archive-probe.json、probe-memory-archive.py、StormLib源码和来源收据。复现探针：python tmp/docs-artifacts/map-loading-audit/probe-memory-archive.py。沿用已有转换和原生加载记录，没有再启动完整转换或广泛测试。

## 优先实施顺序

1. 增加引擎资源字节来源接口与常驻 Warcraft 归档上下文，保留Rust＋TypeScript＋Tauri。公共归档按补丁／版本／语言次序挂载，当前地图覆盖公共路径；归档返回字节流，来源身份必须包含实际提供成员的归档，不能仅按成员路径去重。校验加密／压缩、大小写／locale、同名覆盖、取消与句柄生命周期。这里的挂载指引擎资源命名空间，不需要系统盘符。
2. 将BLP和MDX／MDL解析接到引擎内部纹理、网格、骨骼、材质及特效表示，直接消费内存数据。Map数据解析和场景实例化也使用这些来源。运行地图不产生GLB／PNG／工程目录，不以移除写文件但继续走外部文件转换协议冒充完成；完整MDX、replaceable纹理、billboard及粒子必须分项验证。
3. 运行时地图会话负责切图、释放地图覆盖资源和实例，公共资源缓存按引用与预算保留；与两个视图的既有GPU共享相衔接。地图资源ID由归档来源／成员／版本派生，不生成.meta。编辑器显式“导入为可编辑资产”仍保留现有导出与版本管理路径。
4. 只为经测量值得保留的昂贵解码结果设置可选磁盘缓存，放在工程Assets之外的应用缓存目录。键按实际成员内容、解码器兼容版本与影响输出的选项区分；来源审计哈希单独记录，进度显示、注释和编辑器菜单场景不得使全部模型失效。设置容量／数量上限、引用保护、原子发布、崩溃／取消清理；先做存量清理预览，不自动删除现有用户文件。
5. 载入界面先使用地图w3i定义的载入资源，后续进度对应读取／解码、GPU上传、场景与脚本初始化；联机等待独立展示。读取归档和资源解码放工作线程，界面保持响应。不能用全量资源解包进度替代地图运行进度。

## 第一百五十二阶段：归档字节基础层（新批次1/3）

新增 crates/mengine-mpq 的只读Rust边界与独立C ABI shim，静态编译固定StormLib源码；312个上游构建输入共2,472,985字节，来源、归档与逐文件SHA、许可证及更新方法保存在 third_party/stormlib/。不链接或分发原游戏DLL。Windows使用UTF-16归档路径；CMake3.25+已纳入Windows环境安装入口。

mengine-assets新增 AssetByteSource／AssetMounts、MpqAssetSource 和 WarcraftArchives。公共归档实例可常驻并由多个地图挂载共享，地图位于查找优先序首位，之后为Patch／Local／扩展／原版。真实来源身份＋规范成员路径作为进程内资源键；重开来源产生新身份，缓存不使用可写meta。删除标记和读取错误不会继续回落到低优先级源。

原始字节LRU默认64MiB、4096项，单成员读取上限由调用者指定，示例为256MiB；限额在预留输出缓冲之前检查。缓存预算只约束其持有的Arc，活跃读者可延长字节生命；大成员可不进入缓存。并发冷读取最终共享一个缓存载荷，但尚未合并所有重复解压工作。归档按挂载生命周期视为不变，物理来源变动需重新挂载；运行会话管理和跨阶段失效通知仍待实现。二进制delta成员明确返回DeltaRequiresBase，基础归档／delta链连接仍待接入；不将delta当完整模型或回退旧资源。

6项原生边界与6项资源层定向检查通过，覆盖加密FIX_KEY扇区、zlib／PKWARE、Unicode路径、512字节地图前缀、空成员、缺失与尺寸拒绝、语言选择和外部locale恢复、8线程语言读取、删除与delta拒绝、地图覆盖隔离、错误阻断、LRU／预算及Arc生命周期。独立审核发现的locale恢复语义、Unix宏／错误映射及默认并发测试初始化／线程结束边界已修正并定向复核；Windows外的实际编译仍待对应平台。默认cargo test -p mengine-mpq --lib为6/6，最后线程清理修改只重测相关用例。

真实DotA读取w3i、scripts/war3map.j、公共Footman.mdx与BTNFootman.blp，4个SHA与已有Python读取结果相同；公共模型在地图释放／重新挂载后继续使用相同Arc。字节缓存4项、3,139,856字节，未导出资产或生成meta；这不是完整地图运行或首帧性能证明。示例入口 cargo run -p mengine-assets --example warcraft_archive_bytes -- <game-directory> <map-path>。

新增REA探针 node scripts/probe-frost-rea-archive-loading.mjs <game-directory>，3组静态证据确认受检Game.dll的Storm.dll导入、MPQ名称与Storm导出表，保存原件前后哈希和上游REA身份。没有把ordinal自行映射成SFile函数，也没有执行游戏或将静态表解释为运行耗时。产物在tmp/docs-artifacts/warcraft-archives/rea，源码与FFI检查日志在tmp/docs-artifacts/map-loading-audit/，最终字节探针在tmp/docs-artifacts/warcraft-archives/native-probe-final.json。

当前产品选图仍走原有离线转换链路。本阶段提供可复用的原生读取与资源字节基础，下一任务将BLP／模型解码和地图会话接入这些字节；完整Editor集成、同图／跨图切换、失败取消及磁盘增长按后续3任务批次去重验证。

## 第一百五十三阶段：BLP内存纹理解码（新批次2/3）

新增 `decode_blp_mip_rgba8`、`decode_texture_rgba8` 与 `texture_dimensions_from_bytes`。原生资源层直接从字节解码BLP1调色板／JPEG、BLP2调色板／BGRA／BC1／BC2／BC3，可选择归档中已有的mip。BLP1支持picture type 3／4／5，调色板第四字节不作为透明度，0／1／4／8位透明度从独立平面读取；JPEG保留原始BGR(A)通道，随后排成RGBA。直接使用已存在的zune JPEG依赖，避免印刷CMYK转换覆盖透明度。

每边最多16384像素；BLP调用者传入RGBA输出预算，通用内存纹理入口默认256MiB。分配输出前检查所选mip范围、像素数据最短长度与尺寸，JPEG实际尺寸／组件数必须与BLP一致。输出预算不包含JPEG工作缓冲、归档原始字节或输入重组，不能当作进程总内存上限。PNG／TGA等内存解码也在RGBA扩张前检查预算，TGA使用实际成员名提示格式。既有文件纹理API增加BLP支持，尺寸查询只读最多156字节头；此阶段未增加编辑器BLP资源浏览、缩略图或属性选择支持。

`AssetMounts::read_texture_bytes` 在每个来源内依次尝试精确成员与TGA／BLP别名，再检查下一个归档；返回实际来源和实际成员键。地图BLP可覆盖已经预热的公共TGA，删除标记或读取错误阻断回落。原始字节沿用152的有界缓存，本阶段没有新增解码RGBA缓存或磁盘派生产物。

必要检查为10项BLP格式／边界与8项资源字节检查，通过后对独立审核发现的picture type 3兼容补充只复测受影响的调色板和拒绝边界。测试包含3／4组件JPEG独立常量参考、共享JPEG头、mip、透明度位序、BC插值和不满4像素边缘、损坏与预算拒绝、PNG／TGA、文件BLP及来源别名。两个JPEG夹具由常量图本地生成，生成参数、原始通道参考、Pillow版本和SHA保留在 `scripts/fixtures/warcraft/blp-jpeg-planes.source.json`，不含游戏原图。命令为 `cargo test -p mengine-assets --lib blp` 与 `cargo test -p mengine-assets --lib asset_byte`。

新增消费者示例 `cargo run -p mengine-assets --example warcraft_archive_texture -- <game-directory> <map-path> <member> [reference-rgba-file]`，执行归档查找→成员内存读取→RGBA解码，输出来源、摘要与参考差异，不导出PNG或生成meta。实际DotA挂载下验证公共BTNFootman、菜单边框、Lords_Grass及地图自带war3mapMap：源字节SHA与Python一致；调色板RGBA逐字节一致，3张JPEG相对独立Pillow参考每通道最大差值1，不能写成RGBA哈希一致。三个公共成员重挂地图后保持同一原始字节Arc；地图成员按新的挂载身份隔离。探针为Debug单纹理读取，无GPU上传，不代表整图加载速度或完整游戏运行。

定向测试／构建日志、原始失败与最终对照在 `tmp/docs-artifacts/warcraft-archives/`，最终4成员汇总为 `texture-reference/comparison-final.json`。仅验证用RGBA参考落在该临时目录，产品资源路径不写出纹理。编辑器现有进程未停止或重启，未运行完整地图转换或Editor构建。MDX／MDL、地图数据、GPU消费、会话切换与选图入口仍需接入；152–154相关集成在第3个功能任务完成后统一执行。

## 第一百五十四阶段：经典MDX与Host原生消费（152–154资源／模型批次已验证）

`MdxModel`直接读取version800的模型、序列、全局序列、材质／纹理动画、geoset、节点、附件与pivot。原始轨道按毫秒求值，处理step／linear／Hermite／Bezier与四元数曲线、非循环终点、全局wall时间、无序父级、矩阵组等权蒙皮、UV层／变换、透明度与BGR颜色；转换到现有引擎的轴向与1/128单位。事件与碰撞节点按独立格式来源的bare generic object布局读取，事件／碰撞行为本身没有执行。

默认输入128MiB、解析分配预算256MiB、累计200万顶点／1200万索引／100万keys／8192节点；另限64个顶层chunk、4096序列／材质／geoset、每材质4096层、8组UV。分配前检查记录范围与计数，解析后检查目标引用和拓扑循环。诊断字符串与节点映射计入预算；同一解析预算也用于单次pose输出预检，JPEG工作缓冲、其他资源与GPU缓存分别核算。材质层在每次pose按实际材质求值一次并共享不可变Arc，折叠缩放资格与geoset动画目标在解析期确定。颜色有限性独立于材质共享命中检查。

Host新增 `MountedWarcraftModel`：同步加载接口供后续会话工作线程调用，句柄可通过Arc跨视图共享；纹理按实际归档来源去重，RGBA总量由调用者限定，示例128MiB。它直接向现有RHI上传解码纹理和模型姿态，实例slot使用固定网格键更新；释放slot不删除另一实例或公共纹理。GPU变更前预检展开后的draw、Vertex／index和对象／键预算，默认1024draw、128MiB上传字节、64MiB计划对象字节，可显式调额。这些是单次展开限额，不是整个设备或进程驻留上限。公共纹理引用管理与切图释放仍由后续会话负责。

14项MDX定向检查与3项Host纯CPU绘制规划检查通过。真实Footman源SHA与先前归档探针一致，45个有效姿态／26190顶点对照固定C#参考：位置最大差2.0771026609800458e-7引擎单位，法线最大差4.1403175354837174e-7。循环动画的源区间终点与运行API回绕语义分别处理，未把源终点当作运行首帧；参考采样器49节点，原生57节点包含另8个事件节点，不声称节点计数相同。证据在 `tmp/docs-artifacts/warcraft-archives/mdx-*.log` 与 `native-model-reference/`。

后续材质层使用现有RHI的LessEqual深度比较，允许纹理叠加在相同几何表面。最终Release GPU探针直接消费DotA挂载下的公共Footman及3张纹理：可见7733像素、动画改变10915像素、有叠层相对仅底层改变5110像素；RGBA纹理327936字节。释放后提交旧绘制对象得到空帧，另一slot保持原图，最后释放另一slot也得到空帧；公共原始模型字节重挂共享。已查看最终两张PNG。Tauri custom-protocol Release构建通过，61份前端产物摘要未变；用户Debug编辑器保持原进程。该资源／模型批次关闭，下一功能批次0/3；并非完整地图运行或Warcraft视觉／FPS验收。最终收据在 `tmp/docs-artifacts/warcraft-archives/batch-152-154/final-receipt.json`。

来源、固定提交、参考文件SHA和两份MIT许可证保存在 `third_party/warcraft-model-reference/`。原生读取不调用.NET或外部转换器；独立C#采样器只为本地验证一个模型，原始MDX与参考JSON留在tmp。CPU示例为 `cargo run -p mengine-assets --example warcraft_archive_model -- <game> <map> <member> [reference-json]`；GPU入口为 `cargo run -p mengine-editor-host --release --example render_warcraft_archive -- <game> <map> <member> [capture-directory]`，默认截图目录在tmp。

当前不支持MDL文本、Reforged布局、特殊继承／camera anchoring、完整billboard原游戏对照、粒子／ribbon／light／事件行为。Host对尚未精确支持的filter3／6、sphere mapping、no-depth-test明确拒绝；其他材质属性、替换纹理上下文及整图视觉仍需按原游戏验证。常规选图仍使用离线流程，不能把这次模型消费当作地图加载替换完成。152–154达到3项后只执行累计接口、同一原生版本与代表模型的相关验证，复用未变化的前两阶段结果。

## 第一百五十五阶段：原生地图数据会话（新批次1/3）

`WarcraftMapSession`在一个地图归档作用域内读取W3I18／25、W3E11、WPM0及可选WTS，保留来源身份、原成员字节、地图信息和字符串表。核心地图成员只查当前地图，不会从公共归档借用同名地形或寻路文件；模型等资源命名空间则继续使用地图覆盖＋公共归档。会话成功释放、解析失败和取消均清除该地图来源的缓存引用并关闭归档，公共来源与活跃读者持有的不可变Arc继续有效。每次重新挂载地图使用独立来源身份，不让一个会话释放另一个会话。

默认单成员32MiB、会话原始数据64MiB、解析元数据64MiB、地形1025×1025顶点、寻路4096×4096格、单数组65536项、单字符串1MiB、WTS总内容8MiB。`read_limited`同时检查冷读、缓存命中及并发共享结果；原生MPQ读取在输出分配前应用单成员与会话剩余预算。通用来源的默认实现检查返回长度，其他分配型来源须覆盖此接口才能保证分配前限制。预算约束相应载荷和元数据，不是整个进程、解压工作缓冲或GPU内存上限。

地形七字节corner与寻路cell直接引用原始成员，无逐顶点／逐格堆展开；保留高度、纹理、变体、悬崖层和完整标志位。WPM每轴必须为W3E格数×4，源坐标查询采用半开边界，拒绝非有限坐标。`source_vertex`仅提供原始高度公式，真实坡道／悬崖几何仍需地形编译器，不能当作完整渲染或物理表面。W3I完整读取载入／序章、雾、玩家／阵营、科技及随机尾表，源顺序保留；`game_data_set`对应旧Python字段`loadingScreen`，并非载入背景。分发地图省略编辑器尾表时明确诊断并保留原始尾字节。WTS索引原始UTF-8多行文本，正规化数字ID，未知TRIGSTR保留；语法／编码错误保留原WTS并报告诊断，预算、读取错误与取消继续失败。

同步接口供工作线程调用，阶段为Mount／Info／Terrain／Pathing／Strings／Validate／DataReady。DataReady只表示核心数据可用，不表示GPU、脚本或游戏启动结束。取消在阶段及解析读取处检查，当前不能中断等待中的来源锁或正在执行的StormLib读取；后续UI协调器仍须按加载generation拒绝过期发布。本阶段没有后台任务、UI桥、地形编译、单位放置／对象规则解析或游戏选图替换。

13项地图格式／预算／生命周期检查、10项资源字节检查通过，命令为 `cargo test -p mengine-assets --lib native_warcraft_map -- --test-threads=1` 与 `cargo test -p mengine-assets --lib asset_byte -- --test-threads=1`。新增消费者 `cargo run -p mengine-assets --example warcraft_archive_map -- <game-directory> <map-path> [more-map-paths]` 不写资产、工程或meta，只向stdout报告数据与生命周期。独立只读审核核对固定上游格式及预算／Drop边界；归档调用期间取消延迟已作为接口限制记录。

真实DotA_v6.83d、Amazonia与BootyBay依次打开，12个核心成员SHA、44771个地形corner、704512个寻路cell、W3I全字段及30项WTS内容摘要与既有Python读取器对照通过。涵盖25／18版本、DotA省略尾表及193×97非方形地形。三次释放后只保留公共Footman的同一Arc，缓存1项／105022字节；持有的地图字节在释放后仍有效。Debug核心数据读取仅作诊断，不代表整图启动或冷盘基准。原始收据／对照脚本与日志位于 `tmp/docs-artifacts/warcraft-archives/map-session-*` 和 `compare-map-session.py`。

本项计新批次1/3；后续接入真实地形、世界实例及选图后合并原生验证。不重复完整Editor构建或旧地图转换，不清理用户现有缓存。当前游戏选图仍产生离线文件，运行缓存堆积问题尚未整体关闭。

## 第一百五十六阶段：原生地表与悬崖编译（新批次2/3）

`WarcraftTerrain::compile`直接消费W3E和已挂载归档中的`TerrainArt/Terrain.slk`、`CliffTypes.slk`、悬崖MDX及地表／悬崖BLP，输出真实地形布局、分块网格、合成图集、共享悬崖纹理和实际来源记录。四角顺序、坡道入口共享高度、双格过渡占用、悬崖变体、接缝纹理、地面法线和连续原始高度形变沿用固定参考；没有使用程序化地形替代原图。地表掩码、扩展变体及各tile独立mip采样shader也在内存生成。产品编译接口不写资产、工程或meta。

模型按实际请求的变体增量读取，缓存首个缺失终点并按最后可用变体选择；variation0不会预先解析后续变体。纹理按实际`AssetLocation`在一次编译内共享不可变Arc；跨地图解码缓存尚未实现。当前只接收源锚定的一格悬崖／双格过渡、单geoset、白色全alpha／opaque的UV0恒等材质和cliff replacement11；动画、billboard、多层材质、其他UV和颜色语义明确拒绝，避免静默固定或丢失覆盖行为。

默认16格分块，可选8／16／32格；单成员16MiB、布局128MiB、输出网格256MiB、累计纹理解码／图集128MiB、保留模板32MiB、512模板、4096图集tile及4096输出chunk。大数组预留前检查计数和字节；SYLK坐标、重复单元／表头／行、引号、UTF-8和派生路径／家族先验证再复制，字符串也扣预算。归档、单次MDX解析／采样和图像工作缓冲另有边界，限额不代表整个进程驻留上限；取消沿用协作语义，失败不发布部分地形。

10项地形、1项静态MDX资格及3项纹理别名检查通过，独立审核完成。三图Amazonia／DotA／BootyBay的311来源SHA、38344地块、5587悬崖、323抬高角点、264坡道入口、318块、272405顶点和462216索引与既有Python布局／固定源模板对照通过。索引相等，位置最大差`7.569789886474609e-6`、法线`1.1920928955078125e-7`、UV`2.9038160320737916e-8`；Pillow参考下地表每通道最大差2、悬崖1，不宣称像素精确相等。最终静态资格补修后仅补三图编译，数量一致，复用未变几何／像素对照。Debug CPU耗时仅作诊断，不代表整图加载或FPS。

命令：`cargo test -p mengine-assets --lib native_warcraft_terrain -- --test-threads=1`、`cargo test -p mengine-assets --lib native_mdx_static_consumer -- --test-threads=1`、`cargo test -p mengine-assets --lib asset_byte_texture -- --test-threads=1`。CPU消费者：`cargo run -p mengine-assets --example warcraft_archive_terrain -- <game-directory> <map-path> [validation-directory]`，省略验证目录只输出摘要，指定临时目录才导出参考几何／PNG。证据在`tmp/docs-artifacts/warcraft-archives/native-terrain/`、`terrain-*.log`、`terrain-comparison.json`及`compare-native-terrain.py`。

155–156为2/3，下一相关任务后统一Host／Tauri及实际GPU集成。水面／水深、Host地形上传、实际分块裁剪、视口、世界和选图仍待接入；CPU一致性不等于完整War3画面或帧率验收。现有编辑器和缓存未触碰，常规选图仍使用离线流程，缓存问题尚未整体关闭。

## 第一百五十七阶段：水面与原生地形视图（155–157批次已验证）

地形编译器读取当前地图优先的`Water.slk`及动画纹理，使用W3E水位、湿格、原始surface高度生成水面块和float32小端深度纹理；水深作为线性数据上传，水纹理按sRGB上传。源帧数／速率、格距和浅／深颜色驱动shader，采样在每个动画帧内部重复并隔离mip。无湿格时不读取水面来源；字段、帧尺寸、合成图集和累计布局／纹理／网格预算在生成前检查，水面块与地面／悬崖共享总chunk和网格限额。岸边装饰模型、完整原游戏水面规则和视觉等价不在本阶段完成声明内。

Host新增`MountedWarcraftTerrain`与`WarcraftTerrainView`。CPU句柄可跨视图共享，GPU绑定使用每次独立键并复用既有RHI不可变几何／纹理缓存。上传前预检几何、引用、基级纹理、draw及计划字节；默认4096draw、256MiB网格上传、128MiB基级纹理、64MiB计划，mip／RHI缓存另计。材质使用白色源albedo；水面透明且不写深度，动画只在源帧变化时替换共享材质参数，不重传网格或纹理。释放必须使用原Renderer的稳定资源身份，清除本绑定的mesh／texture键和CPU引用；另一视图有独立绑定。调用者须在卸载时显式release，Renderer本身销毁也会释放其资源。

必要快速检查为2项水位／水深／帧／预算及畸形源检查通过，Host与GPU示例接口编译通过；独立审核发现的悬崖默认灰色已设为白色。新增原生GPU探针`cargo run -p mengine-editor-host --release --example render_warcraft_terrain -- <game-directory> <map-path> [validation-directory]`，默认验证目录位于tmp，只在探针输出截图。产品编译／Host绑定不导出资产或meta。

155–157相关验证已完成，下一功能批次0/3。25项地图／地形／水面及2项Host规划检查通过，Release Host／GPU示例和Tauri custom-protocol构建通过；61份前端摘要未变并复用。既有MPQ／BLP／MDX参考及未受影响检查复用，没有重跑旧离线转换或完整编辑器UI流程。实际覆盖范围如下；用户编辑器保持原进程，游戏世界与原选图入口仍需接入。

三图CPU对照验证449条实际来源记录、11461个水格、135帧纹理、45844个水面顶点和68766索引。水位／水面网格与float32参考一致，179084个深度字节精确一致；水纹理相对Pillow每通道最大差1。此前地表／悬崖几何与像素对照未受水面追加影响，复用156结论；本批小夹具覆盖共同chunk／网格预算及取消／失败。

最终Release GPU近景／全景均已生成：Amazonia／DotA／BootyBay分别93／143／177块，近景实际提交3／8／10块；水面相对不绘制水面改变124325／309／119341像素，推进一帧改变112019／265／107419像素。三图第二Renderer的顶点缓冲复用93／143／177份，设备材质纹理分配均保持5→5。先关闭地图数据会话分别释放214082／383608／426678字节地图缓存，之后仍能绘制已编译数据；错误Renderer释放被拒绝，正确释放后旧objects得到空帧，另一视图保持完全相同画面，最后两视图的纹理键均为空。已查看最终BootyBay全景和DotA近景；原生shader未出现拒绝诊断。该结果证明代表输入的地形／水面消费、裁剪和资源生命周期，未测实际编辑器FPS、长期驻留、完整地图启动或原游戏视觉等价。

最终收据为`tmp/docs-artifacts/warcraft-archives/batch-155-157-receipt.json`，GPU原件在`terrain-gpu-final/`，CPU对照为`water-comparison.json`和`compare-native-water.py`，构建／测试日志为`map-terrain-water-batch-tests.log`、`terrain-host-plan-tests.log`、`terrain-gpu-final-build.log`、`terrain-batch-tauri-release.log`。GPU探针只在验证目录导出PNG；产品路径没有工程资产、meta或离线转换作业写出。Tauri构建仍有既有`world_from_snapshot`未使用警告；构建不等于选图入口已经使用新接口。

## 验收标准

- 同图连续3次加载及跨图公共资源复用：分别记录归档字节、解码命中、GPU上传、脚本初始化和首个接受原生帧；报告冷／热输入与实际中位数、长尾，避免用局部读取探针代表整图。
- 同名成员的地图覆盖、返回主菜单后覆盖释放、另一地图读取公共原件、补丁／语言优先级正确；共用纹理不能串图。
- 常规运行不在项目Assets新增地图资产、meta或原地图副本，不创建离线转换作业；重复加载后磁盘增长受明确预算约束。
- 修改进度提示不触发模型重解码；源成员、解码版本或输出选项变更只失效受影响结果。
- 自定义加载画面、取消／失败恢复、超大及加密／PKWARE地图分别验证；没有完整原图脚本支持时继续明确兼容性，不宣称完整Warcraft运行等价。

运行时完整接入仍在实施队列中，现有磁盘缓存未执行清理。
