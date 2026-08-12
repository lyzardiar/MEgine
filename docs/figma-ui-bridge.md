<!-- Author: MiYu -->

# Figma UI Bridge

MEngine 可以把一个选中的 Figma Frame 直接转换为游戏 UI。桥接沿用现有 Canvas、RectTransform、LayoutGroup、LayoutElement、Text、RawImage、Selectable 和 Undo，不在运行时引入 Figma SDK 或第二套布局模型。

## 数据与安全边界

1. 用户复制带 `node-id` 的 Figma Frame URL。
2. Agent 进程使用 `FIGMA_ACCESS_TOKEN` 访问 Figma REST API；令牌不会进入 WebView、场景、命令参数、日志或返回结果。
3. Agent 把 Figma 节点裁剪、归一化为有界的纯数据源，再调用 Editor 的 `figma.import_plan` 生成确定性预览。
4. 复杂叶节点通过 Figma image endpoint 导出 PNG，并经现有 `asset.import_file` 路径落到项目 `Assets/Figma`。
5. Editor 重新校验 `expectedPlanRevision`，最后用 `figma.import_ui` 在一次 Scene Undo 中创建完整 UI 层级。

Figma 文件读取和图片导出均需要 `file_content:read`。官方接口说明见 [Files endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/)、[Authentication](https://developers.figma.com/docs/rest-api/authentication/) 和 [Scopes](https://developers.figma.com/docs/rest-api/scopes/)。

## 使用方式

编辑器顶部菜单选择 `Window > Figma Import`，可以粘贴带 `node-id` 的 Frame URL、预览诊断并导入当前场景，也可以统一设置：

- PNG 资源目录。
- 单次导入节点上限。
- 复杂视觉节点的 PNG 导出倍率。
- 稳定 Figma `componentId` 到 MEngine 游戏控件的映射。

设置由 CLI、MCP、HTTP 和编辑器导入计划共享；命令显式传入的参数优先。访问令牌不保存在设置窗口或工程文件中。

在启动 Agent 的环境中配置令牌：

```powershell
$env:FIGMA_ACCESS_TOKEN = '<token>'
```

先预览，再导入：

```text
mengine-agent figma-preview "https://www.figma.com/design/FILE_KEY/Game-UI?node-id=12-34"
mengine-agent figma-import "https://www.figma.com/design/FILE_KEY/Game-UI?node-id=12-34" --expected-scene-revision 21
```

可通过 `--args` 指定父级、资源目录、节点上限和稳定组件映射：

```json
{
  "parent": 42,
  "assetFolder": "Assets/Figma",
  "imageScale": 2,
  "maxNodes": 500,
  "componentMappings": {
    "123:456": "button",
    "123:789": "toggle"
  }
}
```

MCP 暴露 `preview_figma_ui` 和 `import_figma_ui`；本地 HTTP 适配器暴露 `POST /v1/figma/preview` 与 `POST /v1/figma/import`。`mengine-agent doctor` 只报告 `figma.configured`，不会输出令牌。

Agent 也可通过 `get_figma_settings` / `set_figma_settings` 读取或修改同一组非敏感默认值；CLI 可使用通用 `query figma.settings` 和 `execute figma.settings.set`。

## 确定性映射

| Figma | MEngine |
|---|---|
| Frame、Group、Section | RectTransform 容器；有纯色背景时使用 Panel |
| Auto Layout Horizontal/Vertical | LayoutGroup、padding、负/正 spacing、alignment、Space Between、Wrap 和 baseline |
| Figma Grid | Grid LayoutGroup、行列、gap、显式 cell、row/column span 和单元格 alignment |
| Fixed / Hug / Fill | RectTransform、ContentSizeFitter、LayoutElement 的 preferred/flexible/min/max |
| Absolute Auto Layout child | LayoutElement.ignore_layout，并保留约束化 RectTransform |
| Constraints | 对应 Left/Right/Center/Stretch/Scale anchors 与 offsets |
| Text | 可编辑 Text，保留内容、字号、字重、颜色、对齐和行高；项目字体通过资产绑定 |
| 纯色 Rectangle | Image |
| Vector、Ellipse、渐变、图片填充、效果 | 导出的 RawImage PNG |
| `clipsContent` | RectMask2D |
| opacity | CanvasGroup |

Figma Instance 不会仅凭图层名称猜测 Button、Toggle 等交互语义。没有显式 `componentMappings` 时，它保持为可编辑的视觉层级并报告 `UNMAPPED_COMPONENT`；映射键使用稳定的 Figma `componentId`。

## 有界行为与诊断

- 每次最多归一化 1,000 个可见节点、导出 128 个 PNG。
- 单个 PNG 最大 16 MiB，总 PNG 最大 64 MiB；Figma JSON 最大 32 MiB。
- 图片导出按文件版本和节点 ID 使用稳定项目路径；已存在的同版本资源直接复用。
- Auto Layout 与 Grid 进入 Editor/Runtime 共用的原生布局求解链；Figma 计算边界只作为初始尺寸与视觉校验基线。
- 圆角裁剪当前用 RectMask2D 近似并报告 `UNSUPPORTED_CORNER_CLIP`。
- Figma 字体家族不会被当作项目资源路径猜测；文字保持为 MEngine Text，并报告 `FONT_REQUIRES_PROJECT_ASSET` 供项目绑定匹配字体。渐变、效果等非原生文字视觉仍可作为单个复杂视觉资源导出。
- 场景或映射在预览后变化会产生 `STALE_REVISION`，不会混合两版计划。
- Figma 429、权限、缺失节点、响应过大和 PNG 渲染失败都返回可操作的结构化错误。

本桥接是单向导入。首版不实现 Figma 双向同步、覆盖已有场景对象、自动交互推断或变量/设计令牌同步。
