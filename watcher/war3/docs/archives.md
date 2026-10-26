# 原生归档视图与资源寿命

公共MPQ按安装根目录共享只读句柄和成员缓存；根路径规范化并按Windows不区分大小写比较。菜单、选图工作线程和世界会话使用各自的`Archives`视图，公共归档优先级仍为War3Patch、War3xLocal、War3x、war3。共享存储在读取/解压/缓存操作期间加锁，同一成员的并发读取返回相同`shared_ptr<const Member>`；不生成磁盘解包文件。

`fork()` 保留当前公共存储和地图挂载。各视图独立切图/卸载，成功准备的`World`持有自己的资源视图；工作线程卸载后，游戏仍可读取该地图内的模型、声音和覆盖资源。最后一个地图视图释放时关闭地图归档及其缓存。已返回的成员字节由使用者的共享引用保留，缓存失效不会悬空。单个视图的挂载切换由其拥有线程负责；跨线程读取使用独立fork视图。

公共缓存预算64MiB，同一安装根目录只保留一份；每个地图挂载预算16MiB，fork共享这一预算和LRU。超预算成员直接返回使用者，不纳入缓存。预算统计缓存持有的字节，不包含调用方正在使用的资源引用。`cachedBytes()` 返回当前视图可见的公共/地图缓存总量。成员仍有128MiB读取上限，原安装只读；失败挂载保留当前有效地图，公共/地图作用域及纹理别名继续遵循来源优先级。

W016快速检查：7项归档检查通过、0失败，覆盖公共成员去重、fork切图隔离、最后地图视图释放、公共/地图作用域与纹理别名、挂载失败保留、8个并发视图各128次读取、16MiB地图LRU及外部引用、真实BootyBay世界在载入器卸载后的继续读取。DotA产品菜单108帧通过、无Game.dll。当前新批次1/3，声音/模型消费及持续切图性能留到合并验证，不将引用检查写成完整性能验收。

```powershell
# watcher/war3
cmake --build --preset release --target war3 war3_archive_tests --parallel 8
./build/windows-x86/bin/Release/war3_archive_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/audio/archive-tests" "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
```

本地证据为 `tmp/docs-artifacts/war3/audio/archive-{build.log,tests-build.log,tests.log,tests/,dota-menu.log}`。原版地图与公共资源没有写入操作，临时合成MPQ仅由检查程序写在上述目录。
