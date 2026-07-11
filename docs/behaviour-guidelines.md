# Behaviour 编写约定

业务层用 TS 类描述可挂接组件；编辑器根据装饰器元数据自动序列化字段并生成 Inspector。Play 模式调用生命周期方法。

## 最小示例

```ts
import {
  Behaviour,
  RegisterBehaviour,
  RequireComponent,
  DisallowMultipleComponent,
  SerializeField,
  Header,
  Range,
  SuffixLabel,
  Button,
  Transform,
  type BehaviourContext,
  type Vec3,
} from '@mengine/behaviour';

@DisallowMultipleComponent
@RequireComponent(Transform)
@RegisterBehaviour('AutoRotate', { label: 'Auto Rotate' })
export class AutoRotate extends Behaviour {
  @Header('Rotation')
  @SerializeField({ type: 'vec3' })
  axis: Vec3 = [0, 1, 0];

  @SerializeField()
  @Range(0, 720)
  @SuffixLabel('°/s')
  angle = 90;

  @Button('Reset Angle')
  resetAngle() {
    this.angle = 90;
  }

  onUpdate(ctx: BehaviourContext) {
    const t = ctx.get(Transform);
    // ...
  }
}
```

类装饰器建议顺序（自上而下）：`@DisallowMultipleComponent` → `@RequireComponent(...)` → `@RegisterBehaviour(...)`。

侧效导入一次以完成注册：`import './behaviours/AutoRotate'`。

## Unity 内置装饰器

| 装饰器 | 作用 |
|--------|------|
| `@SerializeField()` | 序列化并显示 |
| `@HideInInspector()` | 隐藏 |
| `@Header(text)` | 分区标题 |
| `@Space(px?)` | 上间距 |
| `@Tooltip(text)` | 悬停提示 |
| `@Range(min,max)` | 滑条 |
| `@Min` / `@Max` | 数值上下限 |
| `@Multiline(lines?)` / `@TextArea(min,max?)` | 多行文本 |
| `@ContextMenu(name)` | 组件 ⋮ 菜单 |
| `@RequireComponent(...ctors)` | Add 时自动补依赖 |
| `@DisallowMultipleComponent` | 禁止重复添加 |

## Odin 风格装饰器

| 装饰器 | 作用 |
|--------|------|
| `@ShowInInspector` / `@ReadOnly` | 强制显示 / 只读 |
| `@PropertyOrder` / `@PropertySpace` | 排序 / 间距 |
| `@SuffixLabel` / `@Title` / `@InfoBox` | 后缀 / 标题 / 提示条 |
| `@Required` / `@ToggleLeft` / `@ProgressBar` | 校验 / bool 布局 / 进度条 |
| `@ShowIf` / `@HideIf` / `@EnableIf` / `@DisableIf` | 条件显示/启用 |
| `@BoxGroup` / `@FoldoutGroup` / `@HorizontalGroup` | 分组 |
| `@Button` / `@ButtonGroup` | Inspector 按钮 |
| `@OnValueChanged('method')` | 字段变更回调 |
| `@LabelText` / `@PropertyRange` / `@MinValue` / `@MaxValue` / `@ValueDropdown` | 别名 |

## 内置类型

`Transform` / `Camera3D` / `MeshRenderer` / `DirectionalLight` / `Vec3` / `Quat` 等从 `@mengine/behaviour` 导出；`ctx.get(Transform)` 可用类名补全。

## 场景数据

实体只存 plain object；Play 时 runner 实例化 Behaviour，实例本身不进场景 JSON。

## EditorWindow（自定义窗口）

类似 Unity `EditorWindow`：可拖拽浮动窗 + `@MenuItem` 挂到菜单栏。

```ts
import { EditorWindow, MenuItem } from '../editorWindow';

export class MyToolsWindow extends EditorWindow {
  title = 'My Tools';

  @MenuItem('Window/My Tools')
  static openFromMenu() {
    MyToolsWindow.show({ width: 400, height: 320 });
  }

  onGUI() {
    return <div>Hello</div>;
  }
}
```

入口需 `import './editorWindow'`（或具体 window 文件）以注册菜单项。

字段装饰器预览：菜单 **Window → Decorator Gallery**。
