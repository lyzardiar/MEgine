# wgpu 24.0.5

上游：[gfx-rs/wgpu](https://github.com/gfx-rs/wgpu)，源码提交 `99e6524b2b03cc35733f199bb5cb28787e8d42de`，仓库子目录 `wgpu`。发布包、校验值及逐文件原始哈希见 [source.json](source.json)。保留上游 MIT／Apache-2.0 双许可证、README 和原始 Cargo 清单。

工作区通过根 `Cargo.toml` 的 `[patch.crates-io]` 使用此副本，其他 wgpu 组件沿用 `Cargo.lock`。本地仅修改 `src/backend/wgpu_core.rs`：`CoreRenderBundle` 保存所属 context，在最后一个 API 句柄释放时调用 `render_bundle_drop`。已提交命令仍由 wgpu-core 的跟踪器持有，按原 GPU 提交生命周期结束；不提前销毁纹理、不等待 GPU、不禁用渲染包缓存。

维护更新时先按 `source.json` 核对新版本原始源码及许可证，检查上游是否已包含该释放逻辑，再决定是否保留补丁；同步更新来源、哈希和锁文件。定向回归为 `cargo test -p mengine-rhi --release --lib material_texture_lifetime -- --nocapture`，验证实际 GPU 分配退役、共享句柄、在途提交及热更新图像。完整编辑器验证按 `docs/testing-batches.md` 批次执行。
