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
  const dialogHost = fs.readFileSync(path.join(root, 'src', 'EditorDialogHost.tsx'), 'utf8');

  assert.match(project, /role="tree" aria-label="Project folders"/);
  assert.match(project, /tabIndex=\{0\} aria-label="Project browser"/);
  assert.match(project, /role="treeitem"/);
  assert.match(project, /aria-label=\{f\}/);
  assert.match(project, /aria-label=\{`Rename \$\{a\.name\}`\}/);
  assert.match(project, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(project, /aria-label=\{`\$\{folder\} contents`\}/);

  assert.match(hierarchy, /role="tree"/);
  assert.match(hierarchy, /aria-label="Scene hierarchy"/);
  assert.match(hierarchy, /role="treeitem"/);
  assert.match(hierarchy, /aria-label=\{n\.entity\.name \?\? `Entity \$\{id\}`\}/);
  assert.match(hierarchy, /aria-level=\{n\.depth \+ 1\}/);
  assert.match(hierarchy, /data-agent-drag-by="true"/);
  assert.match(hierarchy, /if \(event\.target !== event\.currentTarget\) return/);
  assert.match(hierarchy, /event\.key === 'F2'/);
  assert.match(hierarchy, /aria-label=\{`Rename \$\{n\.entity\.name/);
  assert.match(hierarchy, /aria-label=\{`Drag \$\{n\.entity\.name/);

  assert.match(menu, /role="menubar" aria-label="Main menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open === name\}/);
  assert.match(menu, /onMouseEnter=\{open && open !== name \? \(\) => setOpen\(name\) : undefined\}/);
  assert.match(menu, /const componentItems = listMenuItems\('Component'\)/);
  assert.match(menu, /const editItems = listMenuItems\('Edit'\)/);
  assert.match(menu, /const helpItems = listMenuItems\('Help'\)/);

  assert.match(inspector, /aria-label="Projection"/);
  assert.match(inspector, /aria-label="Clear Flags"/);
  assert.match(inspector, /aria-label="Camera 3D Primary"/);
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
  assert.match(schemaFields, /aria-label=\{`\$\{label\} slider`\}/);
  assert.match(schemaFields, /aria-label=\{`\$\{label\} value`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} color`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} component`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} sprite drop target`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} asset drop target`\}/);
  assert.match(fieldEditors, /aria-label=\{`\$\{props\.label\} entity drop target`\}/);
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

  assert.match(dock, /role="tablist" aria-label="Dock panels"/);
  assert.match(dock, /role="tab"/);
  assert.match(dock, /aria-selected=\{active === kind\}/);
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
  assert.match(spriteEditor, /aria-label="Select sprite slice from preview"\s*onClick=/);
  assert.match(timeline, /aria-label="Animation Timeline workspace"/);
  assert.match(timeline, /aria-label="Animation Timeline lanes"/);
  assert.equal(timeline.match(/data-agent-drag-by="true"/g)?.length, 2);
  assert.match(panel('Material.tsx'), /aria-label=\{`\$\{props\.label\} texture drop target`\}/);
  assert.match(panel('SpriteAtlasEditor.tsx'), /aria-label="Sprite Atlas source drop target"/);
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
  assert.match(sequencer, /aria-label="Scrub Sequencer time ruler"/);
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
