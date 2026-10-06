# Warcraft III 完整节点与附件集合

由 `classic-billboard-ready` 和已核验原始 MDX 派生，覆盖 94 个模型、577 个动画部件、602 个附件节点与 252 条显隐轨道。原二进制网格和蒙皮缓冲保持不变。使用方法、复现命令和验证范围见[原版挂点说明](../../../docs/designs/frostbound-realms/classic-attachments.md)。

`Nodes/` 保存完整源变换和 ATCH 定义；对应 GLB 的 `mengineMdxAnimation` 元数据保存所有源节点与附件轨道。附件可见性描述源内置附件模型，参考节点仍可用于外加技能。转换产物尚未替换 Frostbound 的挂点调用路径。

`asset-sources.json` 记录基集合、原始文件、工具与输出 SHA-256。原游戏资产属于 Blizzard，社区资产遵循原作者条件；派生转换不改变原有使用权限。基集合的来源说明与工具许可保留在 `Licenses/`。
