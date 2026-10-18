# Prefab 单资产查询

Author: MiYu

`prefab.instance`、Apply 和 Revert 通过 `get_project_asset_info` 查询目标文件的最新 revision 和 metadata 健康状态。已有 GUID 索引时不再重新扫描整个资源库；Apply 使用写入接口返回的资产信息更新缓存，避免写入后的重复扫描。

首次遇到目标资产或目标 GUID 改变时，原生接口检查已有 `.meta` 的 GUID 归属。检查直接使用 sidecar parser，不调用其他资产的 importer、不解析图片或字体、不创建其他资产的 metadata，也不使用旧资源列表的 10,000 条截断。它仍需遍历 Assets 目录并读取符合条件的 sidecar；大型项目的实际耗时应通过原生验收记录，不能由单元测试推断。

## 安全边界

- 目标文件复用已有路径限制、非符号链接检查和 `project_asset_info` metadata 校验；目标 metadata 的创建行为沿用原接口。
- 目录访问、sidecar 读取失败或超过 1 MiB 的 sidecar 会使归属检查失败。已存在且 metadata 有效的重复 GUID 会返回 `duplicate`。无对应资产的孤立 sidecar、符号链接及无效 metadata 不作为有效 GUID 所有者。
- 前端保留索引中已知的 duplicate 状态，不以单文件的 `ready` 结果覆盖它。GUID 改变会重新执行归属检查。
- warm 查询复用 GUID 索引，不声称提供全库实时唯一性证明。已有 watcher 每 2 秒尝试刷新索引；新增重复 GUID 在相应扫描完成后才可见，长扫描不保证两秒内发现。本次没有重构 watcher。
- Apply 仍携带 expectedRevision 写入，Revert 仍比较实际读取内容的 revision；查询不会推进已打开资源编辑器的隐式写入基线。
- 单资产读取更新展示缓存，不覆盖 watcher 的历史基线，因此后续 watcher 仍能报告外部修改。

## 已执行验证

以下命令在 `D:/MEngineNativeQA/engine-main-sync` 执行：

```powershell
node --test packages/editor/tests/projectAssetInfo.test.mjs packages/editor/tests/projectAssets.test.mjs packages/editor/tests/projectAssetChanges.test.mjs packages/editor/tests/agentAssetIo.test.mjs
node --test --test-name-pattern=prefab packages/editor/tests/agentBridge.test.mjs
node packages/editor/node_modules/typescript/bin/tsc --project packages/editor/tsconfig.json --noEmit --pretty false
cargo test --manifest-path packages/editor/src-tauri/Cargo.toml --lib project_asset_single_info_keeps_revision_and_sidecar_validation_local --no-default-features --features quickjs-runtime
```

结果：前端针对性测试 17 通过、0 失败；AgentBridge 测试文件通过；TypeScript 检查通过；原生针对性测试 1 通过、0 失败。原生测试覆盖 revision 更新、无关资产不生成 metadata、重复 GUID、损坏 metadata、超大 sidecar 和越界路径。

这些结果不替代最终 Release 编辑器的完整资源库验收。

## 原生冷态检查方法

在已打开目标项目的 Release 编辑器 DevTools 中，对真实 prefab 路径执行：

```js
const started = performance.now();
const result = await window.__TAURI_INTERNALS__.invoke('get_project_asset_info', {
  relativePath: 'Assets/Prefabs/UI/MainMenu.prefab',
  checkGuidOwners: true
});
console.log({elapsedMs: performance.now() - started, result});
```

`true` 强制走首次 GUID 归属检查路径，与操作系统文件缓存是否冷无关。再用 `false` 记录 warm 单文件查询耗时。同步记录 `prefab.instance → Apply → Revert` 的首次实际调用耗时及结果，确认没有 `list_project_assets` 被这些操作额外触发，并确认旧 revision 的 Apply 仍被拒绝。后台 watcher 自身的资源扫描应单独记录。
