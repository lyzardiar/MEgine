# 单位隐藏呈现性能

Author: MiYu.

普通单位槽完成隐藏后跳过重复隐藏；再次可见时重新绘制。英雄死亡与复活阶段每帧呈现，并在结束后执行必要清理。effect pool 继续确认并重试原生写入。

生成 Main.js 的旧/新单位呈现等价检查覆盖 21 场景：迷雾、死亡结束、复活结束、槽移除/重排/复用、菜单/编辑器切换和丢弃原生命令后的恢复。测试包括模型、生命条、选中圈、旗帜、睡眠、单位光环和关联特效节点；重复隐藏调用由 19,890 次降至 7,200 次。

验证入口：`node scripts/test-frost-hidden-unit-slots.mjs`。另通过 effect-pool、hero-death、tauren、corpse 生成客户端测试，以及 hero-death/tauren 的实际 TCP 测试。

同环境真实 Release Game 对照：25.94 → 28.38 FPS，原生模拟平均 15.54 → 12.61 ms。独立 QuickJS 回调基准：11.56 → 8.72 ms。完整呈现仍未达到流畅目标，不能用脚本耗时代替运行帧率。

候选生成脚本 SHA-256：`e8cb5dc6c5467af274de62ca021ab5eb25ca73928160adc52761b3643bc8ae67`。

详细运行证据和引擎采样说明见 `docs/engine-editor-sync/release-large-scene-performance.md`。
