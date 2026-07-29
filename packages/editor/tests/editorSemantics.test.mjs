import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const panel = (name) => fs.readFileSync(path.join(root, 'src', 'panels', name), 'utf8');

test('core editor navigation exposes named semantic controls', () => {
  const project = panel('Project.tsx');
  const hierarchy = panel('Hierarchy.tsx');
  const menu = panel('MenuBar.tsx');
  const popupMenu = panel('PopupMenu.tsx');
  const inspector = panel('Inspector.tsx');
  const dock = panel('DockWorkspace.tsx');
  const hierarchyMenu = panel('HierarchyContextMenu.tsx');
  const objectPicker = panel('ObjectPicker.tsx');
  const spriteEditor = panel('SpriteEditor.tsx');
  const viewport = panel('Viewport.tsx');
  const timeline = panel('Timeline.tsx');
  const rectTransform = panel('RectTransformEditor.tsx');
  const schemaFields = panel('SchemaFieldEditor.tsx');
  const fieldEditors = panel('uiFieldEditors.tsx');
  const projectSettings = panel('ProjectSettings.tsx');
  const material = panel('Material.tsx');
  const buildSettings = panel('BuildSettings.tsx');
  const profiler = panel('Profiler.tsx');
  const animator = panel('Animator.tsx');
  const dialogHost = fs.readFileSync(path.join(root, 'src', 'EditorDialogHost.tsx'), 'utf8');

  assert.match(project, /role="tree" aria-label="Project folders"/);
  assert.match(project, /tabIndex=\{0\} aria-label="Project browser"/);
  assert.match(project, /role="treeitem"/);
  assert.match(project, /aria-label=\{f\}/);
  assert.match(project, /aria-label=\{`Rename \$\{a\.name\}`\}/);
  assert.match(project, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(project, /aria-label=\{`\$\{folder\} contents`\}/);
  assert.match(project, /aria-label="Close asset Trash preview"\s*autoFocus/);
  assert.match(project, /aria-label="Close project Trash"\s*autoFocus/);

  assert.match(hierarchy, /role="tree"/);
  assert.match(hierarchy, /aria-label="Scene hierarchy"/);
  assert.match(hierarchy, /role="treeitem"/);
  assert.match(hierarchy, /aria-label=\{n\.entity\.name \?\? `Entity \$\{id\}`\}/);
  assert.match(hierarchy, /aria-level=\{n\.depth \+ 1\}/);
  assert.match(hierarchy, /data-agent-drag-by="true"/);
  assert.match(hierarchy, /data-agent-scope=\{`Entity \$\{id\}`\}/);
  assert.match(hierarchy, /if \(event\.target !== event\.currentTarget\) return/);
  assert.match(hierarchy, /event\.key === 'F2'/);
  assert.match(hierarchy, /aria-label=\{`Rename \$\{n\.entity\.name/);
  assert.match(hierarchy, /aria-label=\{`Drag \$\{n\.entity\.name/);

  assert.match(menu, /role="menubar" aria-label="Main menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open === name\}/);
  assert.match(menu, /aria-controls=\{menuId\(name\)\}/);
  assert.match(menu, /onMouseEnter=\{open && open !== name \? \(\) => setOpen\(name\) : undefined\}/);
  assert.match(menu, /openMenuAndFocus\(name, event\.key === 'ArrowDown' \? 'first' : 'last'\)/);
  assert.match(menu, /moveMenuItemFocus\(event\.currentTarget, event\.target, event\.key\)/);
  assert.match(popupMenu, /openSubmenu\(\)/);
  assert.match(popupMenu, /event\.key !== 'ArrowLeft' && event\.key !== 'Escape'/);
  assert.match(menu, /const componentItems = listMenuItems\('Component'\)/);
  assert.match(menu, /const editItems = listMenuItems\('Edit'\)/);
  assert.match(menu, /const helpItems = listMenuItems\('Help'\)/);

  assert.match(inspector, /aria-label="Projection"/);
  assert.match(inspector, /aria-label="Clear Flags"/);
  assert.match(inspector, /aria-label="Camera 3D Primary"/);
  assert.match(
    inspector,
    /className="comp-toggle"\s*aria-expanded=\{open\}/,
  );
  assert.match(inspector, /className="comp-foldout" aria-hidden/);
  assert.match(inspector, /aria-label=\{`Adjust \$\{props\.ariaLabel/);
  assert.match(inspector, /aria-label=\{`Adjust \$\{props\.label\}`\}/);
  assert.match(rectTransform, /aria-label=\{`Adjust \$\{props\.ariaLabel\}`\}/);
  assert.match(rectTransform, /aria-label=\{props\.ariaLabel\}/);
  assert.match(
    rectTransform,
    /aria-label="Anchor Presets"\s*aria-haspopup="dialog"\s*aria-expanded=\{presetOpen\}\s*aria-controls="rect-anchor-presets-dialog"/,
  );
  assert.match(
    rectTransform,
    /id="rect-anchor-presets-dialog"\s*className="rect-anchor-popup"\s*role="dialog"/,
  );
  assert.match(
    rectTransform,
    /window\.addEventListener\('keydown', closeWithEscape, true\)/,
  );
  assert.match(schemaFields, /aria-label=\{`\$\{label\} slider`\}/);
  assert.match(schemaFields, /aria-label=\{`\$\{label\} value`\}/);
  assert.match(
    schemaFields,
    /className="schema-foldout-toggle"\s*aria-expanded=\{open\}/,
  );
  assert.match(schemaFields, /<span aria-hidden>\{open \? '▾' : '▸'\}<\/span>/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} color`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} component`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} sprite drop target`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} asset drop target`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} entity drop target`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\}: \$\{label \|\| props\.noneLabel/);
  assert.equal(
    [...fieldEditors.matchAll(/aria-label=\{`Clear \$\{props\.label\}/g)].length,
    4,
  );
  assert.match(fieldEditors, /aria-label=\{`Select \$\{props\.label\} GameObject`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} target: \$\{targetLabel\}`\}/);
  assert.match(fieldEditors, /aria-label=\{`Select \$\{props\.label\} target GameObject`\}/);
  assert.match(fieldEditors, /aria-label="Image Type"/);
  assert.match(projectSettings, /aria-label=\{`Remove tag \$\{tag\}`\}/);
  assert.match(projectSettings, /aria-label=\{`Remove GameObject layer \$\{layer\.name\}`\}/);
  assert.match(projectSettings, /aria-label=\{`Remove sorting layer \$\{layer\.name\}`\}/);
  assert.match(material, /aria-label=\{`\$\{props\.label\} texture preview`\}/);
  assert.match(buildSettings, /aria-label="Refresh build history"/);
  assert.match(buildSettings, /aria-label="Refresh patch inventory"/);
  assert.match(
    viewport,
    /aria-label="Snap settings"\s*aria-haspopup="dialog"\s*aria-expanded=\{snapSettingsOpen\}\s*aria-controls="scene-snap-settings-dialog"/,
  );
  assert.match(
    viewport,
    /aria-label="Align RectTransforms"\s*aria-haspopup="dialog"\s*aria-expanded=\{alignOpen\}\s*aria-controls="scene-rect-alignment-dialog"/,
  );
  assert.equal(
    [...viewport.matchAll(/window\.addEventListener\('keydown', closeWithEscape, true\)/g)].length,
    2,
  );

  assert.match(dock, /role="tablist" aria-label="Dock panels"/);
  assert.match(dock, /role="tab"/);
  assert.match(dock, /aria-selected=\{active === kind\}/);
  assert.match(dock, /tabIndex=\{active === kind \? 0 : -1\}/);
  assert.match(dock, /nextHorizontalTabIndex\(/);
  assert.match(dock, /event\.stopPropagation\(\)/);
  assert.match(dock, /data-agent-drag-by="true"/);
  assert.match(dock, /role="tabpanel"/);
  assert.match(dock, /aria-label=\{`\$\{PANEL_TITLES\[panel\]\} panel`\}/);
  assert.match(dock, /aria-label=\{`Dock \$\{node\.panels\.map/);
  assert.match(dock, /aria-label=\{props\.label\}/);
  assert.match(dock, /label=\{`Resize dock split between \$\{/);
  assert.match(hierarchyMenu, /role="menu"\s*aria-label="Hierarchy context menu"/);
  assert.match(objectPicker, /aria-label=\{`Close \$\{props\.title\}`\}/);
  assert.match(objectPicker, /role="dialog"\s*aria-label=\{props\.title\}/);
  assert.match(objectPicker, /role="combobox"\s*aria-label=\{`Search \$\{props\.title\}`\}/);
  assert.match(objectPicker, /role="listbox"\s*aria-label=\{`\$\{props\.title\} options`\}/);
  assert.equal([...objectPicker.matchAll(/role="option"/g)].length, 2);
  assert.match(objectPicker, /aria-controls=\{listId\}/);
  assert.match(objectPicker, /aria-activedescendant=\{activeOptionId\}/);
  assert.match(objectPicker, /onKeyDown=\{onSearchKeyDown\}/);
  assert.match(objectPicker, /nextObjectPickerOptionIndex\(/);
  assert.equal(
    [...fieldEditors.matchAll(/aria-haspopup="dialog"\s*aria-expanded=\{pickerOpen\}/g)].length,
    5,
  );
  assert.equal(
    [...material.matchAll(/aria-haspopup="dialog"\s*aria-expanded=\{pickerOpen\}/g)].length,
    1,
  );
  assert.match(inspector, /role="menu"\s*aria-label=\{`\$\{props\.title\} component context menu`\}/);
  assert.match(inspector, /role="menuitem"/);
  assert.match(inspector, /aria-haspopup="menu"\s*aria-expanded=\{menuOpen\}\s*aria-controls=\{contextMenuId\}/);
  assert.match(project, /moveMenuItemFocus\(event\.currentTarget, event\.target, event\.key\)/);
  assert.match(
    spriteEditor,
    /role="img"\s*aria-label="Select sprite slice from preview"\s*onClick=/,
  );
  assert.match(
    viewport,
    /role="application"[^>]*data-agent-wheel="true"[^>]*aria-roledescription=\{props\.tab === 'scene'/,
  );
  assert.match(
    timeline,
    /role="img"[^>]*aria-label="Animation curve preview"/,
  );
  assert.match(
    timeline,
    /role="application"[^>]*data-agent-wheel="true"[^>]*aria-roledescription="animation curve editor"/,
  );
  assert.equal(timeline.match(/data-agent-wheel="true"/g)?.length, 2);
  assert.match(profiler, /role="img"[^>]*aria-label=\{`\$\{props\.label\} history`\}/);
  assert.match(profiler, /role="tab"[^>]*aria-selected=\{source === value\}/);
  assert.match(profiler, /aria-controls="profiler-source-panel"/);
  assert.match(profiler, /tabIndex=\{source === value \? 0 : -1\}/);
  assert.match(profiler, /role="tabpanel"/);
  assert.match(profiler, /nextHorizontalTabIndex\(/);
  assert.match(animator, /role="group"[^>]*aria-label="Animator state graph"/);
  assert.match(timeline, /aria-label="Animation Timeline workspace"/);
  assert.match(timeline, /aria-label="Animation Timeline lanes"/);
  assert.equal(timeline.match(/data-agent-drag-by="true"/g)?.length, 2);
  assert.match(panel('Material.tsx'), /aria-label=\{`\$\{props\.label\} texture drop target`\}/);
  assert.match(panel('SpriteAtlasEditor.tsx'), /aria-label="Sprite Atlas source drop target"/);
  assert.match(panel('SpriteAtlasEditor.tsx'), /role="img"/);
  assert.match(panel('SpriteAtlasEditor.tsx'), /aria-hidden=\{!preview\}/);
  assert.match(
    panel('SpriteAtlasEditor.tsx'),
    /Sprite Atlas packed preview, \$\{preview\.naturalWidth\} by \$\{preview\.naturalHeight\} pixels/,
  );
  assert.match(dialogHost, /aria-label=\{`\$\{dialog\.title\} dialog keyboard controls`\}/);
});

test('complex authoring rows identify their selectable semantic regions', () => {
  const animator = panel('Animator.tsx');
  const sequencer = panel('Sequencer.tsx');
  const avatarMask = panel('AvatarMask.tsx');
  const fieldEditors = panel('uiFieldEditors.tsx');

  assert.match(animator, /aria-label=\{`Animator state \$\{state\.name\}`\}/);
  assert.match(animator, /aria-label=\{`Blend tree for \$\{state\.name\}`\}/);
  assert.match(animator, /aria-label=\{`Transition \$\{transition\.from\} to \$\{transition\.to\}`\}/);
  assert.match(animator, /aria-label=\{`Delete state \$\{state\.name\}`\}/);
  assert.match(
    animator,
    /aria-label=\{`Delete transition \$\{transition\.from\} to \$\{transition\.to\}`\}/,
  );
  assert.match(
    animator,
    /aria-label=\{`Delete condition \$\{conditionIndex \+ 1\} from transition/,
  );
  assert.match(
    animator,
    /role="button"\s*aria-label=\{`Select transition \$\{transition\.from\} to \$\{transition\.to\}`\}/,
  );
  assert.match(animator, /aria-label=\{`Parameter \$\{index \+ 1\} name`\}/);
  assert.match(animator, /aria-label=\{`\$\{state\.name\} blend child \$\{childIndex \+ 1\} clip`\}/);
  assert.match(
    animator,
    /aria-label=\{`Transition \$\{transition\.from\} to \$\{transition\.to\} condition \$\{conditionIndex \+ 1\} threshold`\}/,
  );
  assert.match(sequencer, /aria-label=\{`\$\{group\.name\} group lane`\}/);
  assert.match(sequencer, /aria-label=\{`\$\{track\.name\} \$\{track\.type\} lane`\}/);
  assert.match(sequencer, /aria-label="Sequencer workspace"/);
  assert.match(
    sequencer,
    /aria-label="Sequencer tracks viewport"\s*data-agent-wheel="true"/,
  );
  assert.match(sequencer, /aria-label="Scrub Sequencer time ruler"/);
  assert.match(sequencer, /aria-label=\{`\$\{selectedTrack\.type === 'signal'/);
  assert.match(sequencer, /Track fields`\}/);
  assert.match(sequencer, /aria-label="Signal Marker fields"/);
  assert.match(sequencer, /aria-label=\{`\$\{selectedActivationClip \? 'Activation Clip'/);
  assert.match(
    avatarMask,
    /aria-label=\{`Delete Avatar Mask path \$\{index \+ 1\}`\}/,
  );
  assert.match(
    fieldEditors,
    /aria-label=\{`Remove \$\{props\.label\} \$\{index \+ 1\}`\}/,
  );
});

test('top-level help is implemented by a background-safe readable editor window', () => {
  const documentation = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'windows', 'DocumentationWindow.tsx'),
    'utf8',
  );
  const registry = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'index.ts'),
    'utf8',
  );

  assert.match(registry, /import '\.\/windows\/DocumentationWindow'/);
  assert.match(registry, /import '\.\/componentMenuItems'/);
  assert.match(documentation, /registerMenuItem\('Help\/MEngine Documentation'/);
  assert.match(documentation, /context\.source !== 'agent'/);
  assert.match(documentation, /mengine:\/\/project\/state/);
  assert.match(documentation, /mengine:\/\/commands/);
});

test('editor window failures stay isolated and dragging always releases global state', () => {
  const host = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'EditorWindowHost.tsx'),
    'utf8',
  );
  const registeredHost = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'RegisteredEditorWindowHost.tsx'),
    'utf8',
  );
  const boundary = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'EditorWindowErrorBoundary.tsx'),
    'utf8',
  );

  assert.match(host, /<EditorWindowErrorBoundary/);
  assert.match(registeredHost, /<EditorWindowErrorBoundary/);
  assert.match(boundary, /role="alert"/);
  assert.match(boundary, /Window failed to render/);
  assert.match(boundary, />\s*Retry\s*</);
  assert.match(host, /window\.addEventListener\('blur', onUp\)/);
  assert.match(host, /window\.removeEventListener\('blur', onUp\)/);
  assert.match(host, /document\.body\.classList\.remove\('ew-dragging'\)/);
  assert.match(host, /aria-label=\{`Resize \$\{win\.title\} window`\}/);
  assert.match(host, /aria-label=\{`\$\{win\.title\} window`\}/);
  assert.match(host, /aria-label=\{`Move \$\{win\.title\} window`\}/);
});
