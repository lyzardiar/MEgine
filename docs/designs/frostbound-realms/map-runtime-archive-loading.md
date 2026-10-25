# Warcraft 地图运行时资源加载调查

Author: MiYu. 2026-10-25。状态：资源字节与MPQ挂载基础层已实现；游戏运行入口和原生格式解码待接入。

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

## 验收标准

- 同图连续3次加载及跨图公共资源复用：分别记录归档字节、解码命中、GPU上传、脚本初始化和首个接受原生帧；报告冷／热输入与实际中位数、长尾，避免用局部读取探针代表整图。
- 同名成员的地图覆盖、返回主菜单后覆盖释放、另一地图读取公共原件、补丁／语言优先级正确；共用纹理不能串图。
- 常规运行不在项目Assets新增地图资产、meta或原地图副本，不创建离线转换作业；重复加载后磁盘增长受明确预算约束。
- 修改进度提示不触发模型重解码；源成员、解码版本或输出选项变更只失效受影响结果。
- 自定义加载画面、取消／失败恢复、超大及加密／PKWARE地图分别验证；没有完整原图脚本支持时继续明确兼容性，不宣称完整Warcraft运行等价。

运行时完整接入仍在实施队列中，现有磁盘缓存未执行清理。
