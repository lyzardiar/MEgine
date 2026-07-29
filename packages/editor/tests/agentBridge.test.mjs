import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { TYPED_ENTITY_KINDS } from '../src/agent/typedEntityKinds.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('whole-window agent capture is background-safe and addressable by window label', () => {
  const rust = fs.readFileSync(
    path.join(root, 'src-tauri', 'src', 'agent_bridge.rs'),
    'utf8',
  );
  const native = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const tauriConfig = JSON.parse(fs.readFileSync(
    path.join(root, 'src-tauri', 'tauri.conf.json'),
    'utf8',
  ));
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const protocol = fs.readFileSync(path.join(root, 'src', 'agent', 'protocol.ts'), 'utf8');
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );
  const contentScript = rust.match(
    /const WINDOW_UI_CONTENT_SCRIPT: &str = r#"(.*?)"#;/s,
  )?.[1];
  const interactionScript = rust.match(
    /const WINDOW_UI_INTERACTION_SCRIPT: &str = r#"(.*?)"#;/s,
  )?.[1];
  assert.ok(contentScript);
  assert.ok(interactionScript);
  assert.equal(
    [...rust.matchAll(/new TextDecoder\(\)\.decode\(Uint8Array\.from\(/g)].length,
    3,
  );

  assert.match(native, /type_id: Option<String>/);
  assert.match(native, /type_id: editor_type\.clone\(\)/);
  assert.match(protocol, /typeId: string \| null/);
  assert.match(protocol, /editorType: string \| null/);
  assert.match(rust, /Page\.captureScreenshot/);
  assert.match(rust, /validated_capture_region/);
  assert.match(rust, /clipped_element_capture_region/);
  assert.match(rust, /page_x \+ clip\.x/);
  assert.match(rust, /Runtime\.evaluate/);
  assert.match(rust, /WINDOW_UI_SNAPSHOT_SCRIPT/);
  assert.match(rust, /state\.checked = element\.indeterminate \? 'mixed' : element\.checked/);
  assert.match(rust, /WINDOW_UI_CONTENT_SCRIPT/);
  assert.match(rust, /WINDOW_UI_ELEMENT_BOUNDS_SCRIPT/);
  assert.match(rust, /guardedRevision\.elements\?\.get\(selector\)/);
  assert.match(rust, /element !== guardedElement\.element/);
  assert.match(rust, /semantic content changed during element capture/);
  assert.match(protocol, /snapshotRevision\?: string/);
  assert.match(protocol, /elementRect\?: EditorUiRect/);
  assert.match(protocol, /clipped\?: boolean/);
  assert.match(rust, /Password values cannot be read/);
  assert.match(contentScript, /guardedRevision\?\.epoch !== revisionGuard\.epoch/);
  assert.match(contentScript, /const semanticName = \(target\) =>/);
  assert.match(contentScript, /const semanticDescription = \(target, name\) =>/);
  assert.match(contentScript, /else if \(field === 'name'\)/);
  assert.match(contentScript, /else if \(field === 'description'\)/);
  assert.match(
    protocol,
    /field: 'text' \| 'name' \| 'description' \| 'value' \| 'options'/,
  );
  assert.match(rust, /content\.slice\(start, start \+ Number\(maxChars\)\)/);
  assert.match(rust, /const contentRevision = `content-v1-/);
  assert.match(rust, /revisionHashA = Math\.imul/);
  assert.match(rust, /const offset = __MENGINE_OFFSET__/);
  assert.match(rust, /semanticElements\.slice\(offset, offset \+ limit\)/);
  assert.match(rust, /new Map\(candidates\.map/);
  assert.match(rust, /const snapshotRevision = `ui-v21-/);
  assert.match(rust, /revisionHash = BigInt\.asUintN\(64/);
  assert.match(rust, /const semanticScopeFor = \(element\) =>/);
  assert.match(rust, /role === 'tabpanel'/);
  assert.match(rust, /const qualifiedNameFor = \(scope, name\) =>/);
  assert.match(rust, /scope: scope \|\| null/);
  assert.match(rust, /qualifiedName: qualifiedNameFor\(scope, name\) \|\| null/);
  assert.equal([...rust.matchAll(/version: 21,/g)].length, 2);
  assert.match(
    rust,
    /const structural = \/\^h\[1-6\]\$\/\.test\(tag\)\s+\|\| \['p', 'summary', 'legend', 'caption'\]\.includes\(tag\)/,
  );
  assert.match(rust, /if \(tag === 'article'\) return 'article'/);
  assert.match(rust, /if \(tag === 'aside'\) return 'complementary'/);
  assert.match(
    rust,
    /if \(tag === 'details' \|\| tag === 'fieldset' \|\| tag === 'dl'\) return 'group'/,
  );
  assert.match(rust, /if \(tag === 'li'\) return 'listitem'/);
  assert.match(rust, /if \(\['ol', 'ul', 'menu'\]\.includes\(tag\)\) return 'list'/);
  assert.match(rust, /if \(tag === 'p'\) return 'paragraph'/);
  assert.match(rust, /if \(tag === 'table'\) return 'table'/);
  assert.match(rust, /return element\.getAttribute\('scope'\) === 'row' \? 'rowheader' : 'columnheader'/);
  assert.match(rust, /tag === 'section'[\s\S]*return 'region'/);
  assert.match(rust, /if \(element instanceof HTMLDetailsElement\)/);
  assert.match(rust, /state\.expanded = element\.open/);
  assert.equal([...rust.matchAll(/const nativeDialogIsModal = \(/g)].length, 2);
  assert.equal(
    [...rust.matchAll(/querySelectorAll\('dialog, \[role="dialog"\]\[aria-modal="true"\]'\)/g)].length,
    2,
  );
  assert.match(rust, /state\.open = element\.hasAttribute\('open'\)/);
  assert.match(rust, /if \(nativeModal \|\| state\.modal === undefined\) state\.modal = nativeModal/);
  assert.match(rust, /const selectionFor = \(element\) =>/);
  assert.match(rust, /selectionStart: element\.selectionStart/);
  assert.match(rust, /selectionEnd: element\.selectionEnd/);
  assert.match(rust, /selectionDirection: element\.selectionDirection \|\| 'none'/);
  assert.match(rust, /element\.isContentEditable/);
  assert.match(rust, /range\.cloneContents\(\)\.textContent/);
  assert.match(rust, /selectionDirection: focus < anchor/);
  assert.match(rust, /if \(selection\) Object\.assign\(state, selection\)/);
  assert.match(
    rust,
    /element\.localName === 'summary'[\s\S]*element\.parentElement instanceof HTMLDetailsElement/,
  );
  assert.match(rust, /state\.expanded = element\.parentElement\.open/);
  assert.match(rust, /const maxGuardedRevisions = 8/);
  assert.match(rust, /const guardedElements = new Map\(semanticElements\.map/);
  assert.match(rust, /element: candidates\[index\]\.element/);
  assert.match(rust, /actions: \[\.\.\.semanticElement\.actions\]/);
  assert.match(rust, /while \(revisionGuard\.revisions\.size > maxGuardedRevisions\)/);
  assert.equal(
    [...rust.matchAll(/guardedRevision\?\.epoch !== revisionGuard\.epoch/g)].length,
    2,
  );
  assert.equal(
    [...rust.matchAll(/guardedRevision\.elements\?\.get\(/g)].length,
    4,
  );
  assert.match(contentScript, /element !== guardedElement\.element/);
  assert.match(contentScript, /selectorNotExposed: true/);
  assert.match(interactionScript, /element !== guardedElement\.element/);
  assert.match(interactionScript, /targetElement !== guardedTarget\.element/);
  assert.match(interactionScript, /if \(!allowedActions\.includes\(action\)\)/);
  assert.match(interactionScript, /actionNotExposed: true/);
  assert.match(interactionScript, /const coordinateFor = \(/);
  assert.match(interactionScript, /offsetX >= rect\.width/);
  assert.match(interactionScript, /offsetY >= rect\.height/);
  assert.match(interactionScript, /invalidPointerCoordinates: true/);
  assert.match(interactionScript, /requestedTargetOffsetX/);
  assert.match(interactionScript, /targetClientX: targetCoordinates\?\.clientX \?\? null/);
  assert.match(interactionScript, /const buttonName = requestedButton \?\? 'left'/);
  assert.match(interactionScript, /const heldButtons = button === 1 \? 4 : button === 2 \? 2 : 1/);
  assert.match(interactionScript, /'pointerdown', button, heldButtons/);
  assert.match(interactionScript, /'pointermove', -1, heldButtons/);
  assert.match(interactionScript, /'mousemove', 0, heldButtons/);
  assert.match(interactionScript, /button: action === 'dragBy' \? requestedButton \?\? 'left' : null/);
  assert.match(interactionScript, /Array\.isArray\(requestedPath\)/);
  assert.match(interactionScript, /path\.length > 64/);
  assert.match(interactionScript, /for \(const point of path\)/);
  assert.match(interactionScript, /Every dragBy path point must stay inside the target WebView viewport/);
  assert.match(interactionScript, /performedHoverState = requestedHoverState \?\? 'enter'/);
  assert.match(interactionScript, /if \(performedHoverState === 'leave'\)/);
  assert.match(interactionScript, /hoverTargetMismatch: true/);
  assert.match(interactionScript, /window\[hoverState\] = null/);
  assert.match(interactionScript, /hoverStateChanged: action === 'hover' \? hoverStateChanged : null/);
  assert.match(interactionScript, /const beginBlurCommit = \(\) =>/);
  assert.match(interactionScript, /const dispatchValueChange = \(target, value\) =>/);
  assert.match(interactionScript, /reactProps\.onChange\(reactValueEvent\(target, 'change', value\)\)/);
  assert.match(interactionScript, /const dispatchReactFocusLifecycle = \(target, type, nativeTransition\) =>/);
  assert.match(interactionScript, /const captureName = type === 'focus' \? 'onFocusCapture' : 'onBlurCapture'/);
  assert.match(interactionScript, /if \(pendingValueBlur\)/);
  assert.match(interactionScript, /element\.blur\(\)/);
  assert.match(interactionScript, /valueCommitMethod: action === 'setValue' \? valueCommitMethod : null/);
  assert.match(interactionScript, /valueCommitConfirmed: action === 'setValue' \? valueCommitConfirmed : null/);
  assert.match(interactionScript, /valueHandledByReact: action === 'setValue' \? valueHandledByReact : null/);
  assert.match(interactionScript, /valueDraftSynchronized: action === 'setValue' \? valueDraftSynchronized : null/);
  assert.match(interactionScript, /valueFocusHandledByReact: action === 'setValue' \? valueFocusHandledByReact : null/);
  assert.match(interactionScript, /valueBlurHandledByReact: action === 'setValue' \? valueBlurHandledByReact : null/);
  assert.match(interactionScript, /const wheelEvent = new WheelEvent\('wheel'/);
  assert.match(interactionScript, /const applyNativeScroll = element\.dispatchEvent\(wheelEvent\)/);
  assert.match(interactionScript, /if \(applyNativeScroll\) \{/);
  assert.match(
    interactionScript,
    /action === 'scroll'[\s\S]*?const deltaY = Number\(requestedDeltaY \?\? 0\)/,
  );
  assert.match(rust, /getAttribute\('data-agent-wheel'\) === 'true'/);
  assert.match(rust, /typeof props\.onWheel === 'function'/);
  assert.match(rust, /"contextClick"\s*\|\s*"scroll"\s*\|\s*"keyPress"/);
  assert.match(bridge, /window\.ui_scroll requires a non-zero deltaX or deltaY/);
  assert.match(bridge, /if \(result\.selectorNotExposed \|\| result\.actionNotExposed\)/);
  assert.match(bridge, /if \(result\.invalidPointerCoordinates\)/);
  assert.match(protocol, /targetSelectorNotExposed\?: boolean/);
  assert.match(protocol, /invalidPointerCoordinates\?: boolean/);
  assert.match(protocol, /targetClientY\?: number \| null/);
  assert.match(protocol, /button\?: 'left' \| 'middle' \| 'right' \| null/);
  assert.match(protocol, /path\?: EditorUiDragPathPoint\[\] \| null/);
  assert.match(protocol, /hoverTargetMismatch\?: boolean/);
  assert.match(protocol, /hoverState\?: 'enter' \| 'leave' \| null/);
  assert.match(protocol, /hoverStateChanged\?: boolean \| null/);
  assert.match(protocol, /valueCommitMethod\?: 'change' \| 'blur' \| null/);
  assert.match(protocol, /valueCommitConfirmed\?: boolean \| null/);
  assert.match(protocol, /valueHandledByReact\?: boolean \| null/);
  assert.match(protocol, /valueDraftSynchronized\?: boolean \| null/);
  assert.match(protocol, /valueFocusHandledByReact\?: boolean \| null/);
  assert.match(protocol, /valueBlurHandledByReact\?: boolean \| null/);
  assert.match(protocol, /allowedActions\?: EditorUiAction\[\]/);
  assert.match(rust, /const ariaStateKeys = \[/);
  for (const key of [
    'valuemin',
    'valuemax',
    'valuenow',
    'valuetext',
    'orientation',
    'multiselectable',
    'autocomplete',
    'live',
    'keyshortcuts',
    'activedescendant',
  ]) {
    assert.match(rust, new RegExp(`'${key}'`));
  }
  assert.match(rust, /for \(const key of ariaStateKeys\)/);
  assert.equal([...rust.matchAll(/const effectivelyDisabled = \(/g)].length, 2);
  assert.equal([...rust.matchAll(/\.matches\(':disabled'\)/g)].length, 2);
  assert.equal(
    [...rust.matchAll(/\.closest\('\[aria-disabled="true"\]'\)/g)].length,
    2,
  );
  assert.equal([...rust.matchAll(/const semanticallyHidden = \(/g)].length, 3);
  assert.equal(
    [...rust.matchAll(/\.closest\('\[aria-hidden="true"\], \[inert\]'\)/g)].length,
    4,
  );
  assert.equal([...rust.matchAll(/const semanticText = \(/g)].length, 3);
  assert.equal([...rust.matchAll(/includeHiddenSubtree = false/g)].length, 3);
  assert.equal(
    [...rust.matchAll(/includeHiddenSubtree \|\| !parent \|\| !semanticallyHidden\(parent\)/g)].length,
    3,
  );
  assert.equal(
    [...rust.matchAll(/semanticText\(node, null, semanticallyHidden\(node\)\)/g)].length,
    2,
  );
  assert.match(
    interactionScript,
    /semanticText\(labelledBy, semanticallyHidden\(labelledBy\)\)/,
  );
  assert.equal([...rust.matchAll(/document\.createTreeWalker\(/g)].length, 4);
  assert.match(rust, /const referencedText = \(idRefs\) =>/);
  assert.equal([...rust.matchAll(/const labelledByText = \(/g)].length, 3);
  assert.equal([...rust.matchAll(/const nativeLabelText = \(/g)].length, 3);
  assert.match(rust, /const text = referencedText\(labelledBy\)/);
  assert.match(
    rust,
    /labelledByText\(element\)\s*\|\| element\.getAttribute\('aria-label'\)\s*\|\| nativeLabelText\(element\)/,
  );
  assert.match(
    contentScript,
    /labelledByText\(target\)\s*\|\| target\.getAttribute\('aria-label'\)\s*\|\| nativeLabelText\(target\)/,
  );
  assert.match(
    interactionScript,
    /return labelledByText\(target\)\s*\|\| normalizeName\(target\.getAttribute\('aria-label'\)\)\s*\|\| nativeLabelText\(target\)/,
  );
  assert.match(
    rust,
    /referencedText\(element\.getAttribute\('aria-describedby'\)\)/,
  );
  assert.match(
    rust,
    /referencedText\(element\.getAttribute\('aria-describedby'\)\)\s*\|\| element\.getAttribute\('aria-description'\)/,
  );
  assert.match(rust, /const content = semanticText\(element\)/);
  assert.match(rust, /return semanticText\(label, element\)/);
  assert.match(interactionScript, /\? semanticText\(target\)/);
  assert.match(interactionScript, /return semanticText\(target\)/);
  assert.match(rust, /if \(semanticallyHidden\(element\)\) return false/);
  assert.match(interactionScript, /if \(semanticallyHidden\(target\)\) return false/);
  assert.match(interactionScript, /if \(!rendered\(element\)\)/);
  assert.match(interactionScript, /if \(targetElement && !rendered\(targetElement\)\)/);
  assert.match(
    interactionScript,
    /not rendered in the semantic accessibility tree/,
  );
  assert.match(rust, /if \(effectivelyDisabled\(element\)\) return actions/);
  assert.match(rust, /disabled: effectivelyDisabled\(element\)/);
  assert.match(interactionScript, /if \(effectivelyDisabled\(element\)\)/);
  assert.match(
    interactionScript,
    /if \(targetElement && effectivelyDisabled\(targetElement\)\)/,
  );
  assert.match(rust, /const controlFor = \(element\) =>/);
  assert.match(rust, /control: controlFor\(element\)/);
  assert.equal([...rust.matchAll(/type === 'number'\) return 'spinbutton'/g)].length, 3);
  assert.equal([...rust.matchAll(/type === 'search'\) return 'searchbox'/g)].length, 3);
  assert.equal([...rust.matchAll(/return 'combobox';/g)].length, 3);
  assert.equal([...rust.matchAll(/localName === 'output'\) return 'status'/g)].length, 1);
  assert.match(rust, /tag === 'output'\) return 'status'/);
  assert.match(rust, /tag === 'meter'\) return 'meter'/);
  assert.match(rust, /const containingLabelText = \(element\) =>/);
  assert.match(rust, /\['status', 'meter', 'progressbar'\]\.includes\(role\)/);
  assert.match(rust, /element instanceof HTMLOutputElement \|\| element instanceof HTMLMeterElement/);
  assert.match(rust, /element instanceof HTMLProgressElement/);
  assert.match(rust, /kind: 'progress'/);
  assert.match(rust, /kind: 'meter'/);
  assert.match(rust, /return \{ kind: 'output' \}/);
  assert.match(contentScript, /element instanceof HTMLOutputElement/);
  assert.match(contentScript, /element instanceof HTMLProgressElement/);
  assert.match(protocol, /\| 'progress'/);
  assert.match(protocol, /\| 'meter'/);
  assert.match(protocol, /\| 'output'/);
  assert.match(protocol, /indeterminate\?: boolean/);
  assert.match(rust, /control\.optionsRevision = compactContentRevision\('options'/);
  assert.match(rust, /optionCount: optionPayload\.options\.length/);
  assert.match(rust, /const visibleModalDialogs = Array\.from\(/);
  assert.equal([...rust.matchAll(/const modalLayerFor = \(candidate\) =>/g)].length, 2);
  assert.equal([...rust.matchAll(/if \(layer >= activeModalLayer\)/g)].length, 2);
  assert.equal(
    [...rust.matchAll(/candidate\.contains\(document\.activeElement\)/g)].length,
    2,
  );
  assert.match(rust, /state\.modalBlocked = true/);
  assert.match(rust, /const actions = modalBlocked \? \[\] : actionList\(element, role\)/);
  assert.match(rust, /state: stateFor\(element, modalBlocked\)/);
  assert.match(contentScript, /if \(field === 'options'\)/);
  assert.match(contentScript, /kind === 'select' \? option\.selected : false/);
  assert.match(contentScript, /has no readable select or datalist options/);
  assert.match(rust, /nextOffset:/);
  assert.match(rust, /hasMore:/);
  assert.match(rust, /WINDOW_UI_INTERACTION_SCRIPT/);
  assert.match(rust, /setCheckableInput/);
  assert.match(rust, /HTMLInputElement\.prototype,\s*'checked'/);
  assert.match(rust, /typeof reactProps\.onChange === 'function'/);
  assert.match(rust, /\['checkbox', 'radio'\]\.includes\(element\.type\)/);
  assert.match(interactionScript, /does not offer enabled option/);
  assert.match(interactionScript, /requires a finite numeric value/);
  assert.match(interactionScript, /requires a six-digit hexadecimal color/);
  assert.match(interactionScript, /cannot represent the requested value/);
  assert.match(interactionScript, /setter\.call\(element, previousValue\)/);
  assert.match(interactionScript, /const nativeValidityIssues = \(target\) =>/);
  assert.match(interactionScript, /'stepMismatch'/);
  assert.match(interactionScript, /target\.value\.length < target\.minLength/);
  assert.match(interactionScript, /return constraintFailure\(validityIssues\)/);
  assert.match(interactionScript, /const applyTextControlDefault = \(\) =>/);
  assert.match(interactionScript, /const printableKey = \(/);
  assert.match(interactionScript, /Array\.from\(requestedKey\)\.length === 1/);
  assert.match(
    interactionScript,
    /&& !\/\[\\p\{Cc\}\\p\{Cs\}\\p\{Z\}\]\/u\.test\(requestedKey\)/,
  );
  assert.match(interactionScript, /`Key\$\{key\.toUpperCase\(\)\}`/);
  assert.match(interactionScript, /`Digit\$\{key\}`/);
  assert.match(rust, /value\.strip_prefix\('F'\)/);
  assert.match(rust, /\(1\.\.=24\)\.contains\(&parsed\)/);
  assert.match(interactionScript, /if \(printableKey\) \{\s*replacement = key/);
  assert.match(interactionScript, /element\.maxLength >= 0 && nextValue\.length > element\.maxLength/);
  assert.match(interactionScript, /element\.setSelectionRange\(/);
  assert.match(interactionScript, /inputType = 'deleteContentBackward'/);
  assert.match(interactionScript, /inputType = 'deleteContentForward'/);
  assert.match(interactionScript, /inputType = 'insertLineBreak'/);
  assert.match(interactionScript, /const handledTextDefault = acceptsDefault && applyTextControlDefault\(\)/);
  assert.match(interactionScript, /const applyContentEditableDefault = \(\) =>/);
  assert.match(interactionScript, /const handledContentEditableDefault = \(/);
  assert.match(interactionScript, /const textPointAt = \(rawOffset\) =>/);
  assert.match(interactionScript, /new InputEvent\('beforeinput'/);
  assert.match(interactionScript, /replacementRange\.deleteContents\(\)/);
  assert.match(interactionScript, /replacementRange\.insertNode\(inserted\)/);
  assert.match(interactionScript, /const verticalColumnKey = Symbol\.for\('mengine\.agent\.textVerticalColumn'\)/);
  assert.match(interactionScript, /'ArrowUp',\s*'ArrowDown',\s*'PageUp',\s*'PageDown'/);
  assert.match(interactionScript, /element\[verticalColumnKey\] = \{\s*column: preferredColumn,\s*position: target,\s*lineStart: targetLineStart/);
  assert.match(interactionScript, /const applyNativeDialogDefault = \(\) =>/);
  assert.match(interactionScript, /dialog\.dispatchEvent\(new Event\('cancel'/);
  assert.match(interactionScript, /if \(!cancelled && dialog\.open\) dialog\.close\(\)/);
  assert.match(
    interactionScript,
    /const handledDialogDefault = \(\s*acceptsDefault\s*&& !handledTextDefault\s*&& !handledContentEditableDefault\s*&& applyNativeDialogDefault\(\)/,
  );
  assert.match(interactionScript, /const applyNativeControlDefault = \(\) =>/);
  assert.match(interactionScript, /\['checkbox', 'radio'\]\.includes\(element\.type\)/);
  assert.match(interactionScript, /element instanceof HTMLSelectElement && !element\.multiple/);
  assert.match(interactionScript, /element\.selectedIndex = nextIndex/);
  assert.match(interactionScript, /if \(steps > 0\) element\.stepUp\(steps\)/);
  assert.match(interactionScript, /else element\.stepDown\(-steps\)/);
  assert.match(interactionScript, /const handledNativeDefault = \(/);
  assert.match(bridge, /if \(result\.constraintViolation\) \{/);
  assert.match(bridge, /validityIssues: result\.validityIssues \?\? \[\]/);
  assert.match(interactionScript, /is blocked by active modal dialog/);
  assert.match(interactionScript, /modalBlocked: true/);
  assert.match(interactionScript, /activeModal\.contains\(targetElement\)/);
  assert.match(bridge, /if \(result\.modalBlocked\) \{/);
  assert.match(bridge, /'Interact with or dismiss the active modal dialog first'/);
  assert.match(rust, /MENGINE_EDITOR_CONFIG_DIR/);
  assert.match(rust, /\| "dragTo"/);
  assert.match(rust, /key\.startsWith\('__reactProps\$'\)/);
  assert.match(rust, /actions\.push\('doubleClick'\)/);
  assert.match(rust, /actions\.push\('contextClick'\)/);
  assert.match(rust, /dispatchPointer\('pointerdown'/);
  assert.match(rust, /dispatchPointer\('dblclick'/);
  assert.match(rust, /dispatchPointer\('contextmenu'/);
  assert.match(rust, /element\.scrollBy/);
  assert.match(rust, /actions\.push\('scroll'\)/);
  assert.match(rust, /actions\.push\('keyPress'\)/);
  assert.match(
    rust,
    /element\.isContentEditable && !readOnly/,
  );
  assert.match(
    interactionScript,
    /'button, input, select, textarea, a\[href\], area\[href\], summary, '/,
  );
  assert.match(interactionScript, /candidate\.tabIndex >= 0/);
  assert.match(interactionScript, /&& rendered\(candidate\)/);
  assert.match(interactionScript, /&& !effectivelyDisabled\(candidate\)/);
  assert.match(
    interactionScript,
    /&& \(!activeModal \|\| activeModal\.contains\(candidate\)\)/,
  );
  assert.match(interactionScript, /const leftPositive = left\.tabIndex > 0/);
  assert.match(interactionScript, /return left\.tabIndex - right\.tabIndex/);
  assert.match(rust, /actions\.push\('dragTo'\)/);
  assert.match(rust, /actions\.push\('dragBy'\)/);
  assert.match(rust, /"shiftKey": shift_key\.unwrap_or\(false\)/);
  assert.match(rust, /"ctrlKey": ctrl_key\.unwrap_or\(false\)/);
  assert.match(rust, /modifier keys are only valid for click, wheel, key, or drag actions/);
  assert.match(rust, /shiftKey: requestedShiftKey === true/);
  assert.match(rust, /\.\.\.modifiers/);
  assert.match(rust, /modifiers\.shiftKey \? focusable\.length - 1 : 0/);
  assert.match(rust, /getAttribute\('data-agent-drag-by'\) === 'true'/);
  assert.match(rust, /typeof props\.onClick !== 'function' \|\| explicitDragBy/);
  assert.match(rust, /typeof reactProps\.onClick === 'function' && !explicitDragBy/);
  assert.match(rust, /actions\.push\('hover'\)/);
  assert.match(rust, /new DataTransfer\(\)/);
  assert.match(rust, /new DragEvent\(type/);
  assert.match(rust, /dispatchDrag\(targetElement, 'drop'\)/);
  assert.match(rust, /Every dragBy path point must stay inside the target WebView viewport/);
  assert.match(rust, /Object\.defineProperty\(element, name/);
  assert.match(rust, /dispatchPointerAt\(element, 'mousemove'/);
  assert.match(rust, /Symbol\.for\('mengine\.agent\.hoveredElement'\)/);
  assert.match(rust, /!previous\.contains\(element\)/);
  assert.match(rust, /props\.onPointerLeave\(reactHoverEvent\(target/);
  assert.match(rust, /reactProps\.onPointerEnter\(reactHoverEvent/);
  assert.doesNotMatch(contentScript, /targetElement|targetSelector|action === 'dragTo'/);
  assert.match(interactionScript, /let targetElement = null/);
  assert.match(interactionScript, /document\.querySelector\(targetSelector\)/);
  assert.match(rust, /new KeyboardEvent\(type/);
  assert.match(rust, /requestedKey === 'Space' \? ' ' :/);
  assert.match(rust, /element\.focus\(\{ preventScroll: true \}\)/);
  assert.match(rust, /scrollableOverflow/);
  assert.match(rust, /scrollContextName/);
  assert.match(rust, /meaningfulContentName/);
  assert.match(rust, /interactionName/);
  assert.match(rust, /role: roleForName\(element\) \|\| null/);
  assert.doesNotMatch(rust, /typeof element\.onclick === 'function'/);
  assert.match(rust, /height: element\.scrollHeight/);
  assert.match(rust, /clientHeight: element\.clientHeight/);
  assert.match(rust, /'level',\s*'haspopup',/);
  assert.match(rust, /getAttribute\('data-agent-interaction'\) === 'blocked'/);
  assert.match(rust, /data-agent-blocked-actions/);
  assert.match(rust, /agentInteraction/);
  assert.match(rust, /blockedActions: null/);
  assert.match(rust, /agentPolicy\.blockedActions\.includes\(action\)/);
  assert.match(rust, /agentBlocked: true/);
  assert.match(rust, /agentAlternative: alternative/);
  assert.match(rust, /STANDARD\.encode\(payload\)/);
  assert.match(rust, /window_label:\s*Option<String>/);
  assert.match(rust, /background_safe:\s*true/);
  assert.doesNotMatch(rust, /\bSetForegroundWindow\b\s*\(/);
  assert.doesNotMatch(rust, /\bBitBlt\b\s*\(/);
  assert.match(rust, /sink\.close\(\)\.await/);
  assert.equal(tauriConfig.app.windows[0].visible, false);
  assert.equal(tauriConfig.app.windows[0].focus, false);
  assert.match(native, /MENGINE_EDITOR_BACKGROUND/);
  assert.match(native, /MENGINE_EDITOR_CONFIG_DIR must be an absolute path/);
  assert.match(native, /fn get_editor_instance_id\(state: State<'_, AppState>\)/);
  assert.match(native, /editor_instance_id: uuid::Uuid::new_v4\(\)\.to_string\(\)/);
  assert.match(native, /if starts_in_background\(\)/);
  assert.match(native, /main\.hide\(\)\?/);
  assert.match(native, /main\.set_focusable\(false\)\?/);
  assert.match(native, /main\.show\(\)\?/);
  assert.match(native, /main\.set_focus\(\)\?/);
  assert.match(native, /visible: window\.is_visible\(\)\.unwrap_or\(false\)/);
  assert.match(native, /fn close_editor_window\(/);
  assert.match(native, /validate_agent_editor_window_label/);
  assert.match(native, /validate_agent_editor_window_state\(visible, focused\)/);
  assert.match(native, /window\s*\.destroy\(\)/);
  assert.match(native, /async fn import_project_asset/);
  assert.match(native, /std::fs::hard_link\(&temporary, target\)/);
  assert.match(bridge, /DEFAULT_SCREENSHOT_MAX_SIZE = 2_048/);
  assert.match(bridge, /MIN_SCREENSHOT_INTERVAL_MS = 250/);
  assert.match(bridge, /MAX_PENDING_SCREENSHOTS = 8/);
  assert.match(bridge, /private async scheduleScreenshot/);
  assert.match(bridge, /'RATE_LIMITED'/);
  assert.match(bridge, /pendingScreenshots: this\.pendingScreenshotCount/);
  assert.match(bridge, /pendingEventWaits: MAX_AGENT_EVENT_WAITERS/);
  assert.match(bridge, /maxConcurrentEventWaits: MAX_AGENT_EVENT_WAITERS/);
  assert.match(bridge, /this\.lastScreenshotCompletedAt \+ MIN_SCREENSHOT_INTERVAL_MS/);
  assert.match(bridge, /captureWindow\(\s*windowLabel = 'main',\s*maxSize = DEFAULT_SCREENSHOT_MAX_SIZE/);
  assert.match(bridge, /inspectWindow\(/);
  assert.match(bridge, /Continuation pages require "expectedSnapshotRevision"/);
  assert.match(bridge, /snapshot\.snapshotRevision !== expectedRevision/);
  assert.match(bridge, /'STALE_REVISION'/);
  assert.match(bridge, /restartOffset: 0/);
  assert.match(bridge, /readWindowContent\(/);
  assert.match(bridge, /Window UI content reads require expectedSnapshotRevision/);
  assert.match(bridge, /Continuation pages require "expectedContentRevision"/);
  assert.match(bridge, /result\.contentRevision !== expectedRevision/);
  assert.match(bridge, /Continuation pages require "expectedSceneRevision"/);
  assert.match(bridge, /currentSceneRevision: sceneRevision/);
  assert.match(bridge, /function projectAssetIndexRevision/);
  assert.match(bridge, /Continuation pages require "expectedIndexRevision"/);
  assert.match(bridge, /currentIndexRevision: indexRevision/);
  assert.match(bridge, /function assetTrashIndexRevision/);
  assert.match(bridge, /Continuation pages require "expectedTrashRevision"/);
  assert.match(bridge, /currentTrashRevision: trashRevision/);
  assert.match(bridge, /offset: boundedOffset/);
  assert.match(bridge, /gameResolution: store\.gameResolution/);
  assert.match(bridge, /sceneView: readSceneViewPreferences\(\)/);
  assert.match(bridge, /capture_editor_window',\s*\{ windowLabel, maxSize:/);
  assert.match(rust, /Page\.getLayoutMetrics/);
  assert.match(rust, /\"clip\": \{/);
  assert.match(rust, /screenshot exceeded maxSize/);
  assert.match(rust, /source_width,/);
  assert.match(rust, /scale: output_scale\.min\(1\.0\)/);
  assert.match(bridge, /window\.ui_drag_by requires a non-zero deltaX or deltaY/);
  assert.match(bridge, /window\.ui_drag_by path is mutually exclusive with deltaX and deltaY/);
  assert.match(bridge, /Hover leave target does not match the current semantic hover target/);
  assert.match(bridge, /Semantic value edit changed the control but did not confirm its commit boundary/);
  assert.match(bridge, /action === 'setValue' && result\.valueCommitConfirmed === false/);
  assert.match(bridge, /Window UI interaction requires expectedSnapshotRevision/);
  assert.match(bridge, /must be hidden and unfocused before semantic UI interaction/);
  assert.match(bridge, /requiredWindowState: 'hidden-unfocused'/);
  assert.match(bridge, /result\.staleSnapshot/);
  assert.match(bridge, /'STALE_REVISION'/);
  assert.match(rust, /inspect_editor_window_impl\(app\.clone\(\), window_label\.clone\(\), 50, 0\)/);
  assert.match(
    rust,
    /validate_background_ui_interaction_window\(&app, &window_label\)\?;[\s\S]*validate_background_ui_interaction_window\(&app, &window_label\)\?;/,
  );
  assert.match(rust, /fn validate_background_ui_interaction_state\(visible: bool, focused: bool\)/);
  assert.match(rust, /semantic_ui_interaction_refuses_visible_or_focused_windows/);
  assert.match(rust, /actualSnapshotRevision/);
  assert.match(rust, /new MutationObserver/);
  assert.match(rust, /guardedRevision\?\.epoch !== revisionGuard\.epoch/);
  assert.match(rust, /evaluate_webview_script_with_await\(&app, &window_label, expression, true\)/);
  assert.match(rust, /await waitForRender\(\)/);
  assert.match(rust, /postObservationConfirmed/);
  assert.match(rust, /postSnapshotRevision/);
  assert.match(bridge, /result\.screenshotRequested = true/);
  assert.match(bridge, /result\.screenshotCaptured = true/);
  assert.match(bridge, /result\.screenshotCaptured = false/);
  assert.match(bridge, /result\.screenshotError =/);
  assert.match(rust, /const semanticElements = candidates\.map\(semanticElementFor\)/);
  assert.match(rust, /if \(tag === 'summary'\) return 'button'/);
  assert.match(rust, /if \(target\.localName === 'summary'\) return 'button'/);
  assert.match(rust, /elements: semanticElements/);
  assert.match(rust, /state: stateFor\(element, modalBlocked\)/);
  assert.match(rust, /agentInteraction: agentPolicyFor\(element\)/);
  assert.match(rust, /scroll: scrollFor\(element, actions\)/);
  assert.match(rust, /rect: rectFor\(element\)/);
  assert.match(mcp, /UI_SNAPSHOT_REVISION_SCHEMA/);
  assert.match(mcp, /function nonEmptyStringSchema/);
  assert.match(bridge, /candidate\.totalSemanticElements > 0/);
  assert.match(bridge, /semanticReady: true/);
  assert.match(bridge, /private async waitForWorkspaceDocument/);
  assert.match(bridge, /candidate\.active/);
  assert.match(bridge, /Resource editor did not activate/);
  assert.match(bridge, /const document = await this\.waitForWorkspaceDocument\(target\)/);
  assert.doesNotMatch(bridge, /document \?\? \{ \.\.\.target, active: true/);
  assert.match(bridge, /private async waitForPanelFocused/);
  assert.match(bridge, /Panel .* did not become active within 5 seconds/);
  assert.match(bridge, /private async waitForPanelLayoutReset/);
  assert.match(bridge, /isDefaultPanelLayout\(lastLayout\)/);
  assert.match(bridge, /function isDefaultPanelLayout\(layout: PanelLayoutSnapshot\)/);
  assert.match(bridge, /nativePanelWindows: lastNativePanelWindows/);
  assert.match(bridge, /agentOwnedEditorWindows = new Set<string>\(\)/);
  assert.match(
    bridge,
    /existing && \(existing\.visible \|\| existing\.focused\)[\s\S]*cannot be reused for background Agent work/,
  );
  assert.match(
    bridge,
    /if \(target\.visible \|\| target\.focused\)[\s\S]*cannot be used for background Agent work/,
  );
  assert.match(bridge, /if \(existing === undefined\) this\.agentOwnedEditorWindows\.add/);
  assert.match(bridge, /if \(!this\.agentOwnedEditorWindows\.has\(windowLabel\)\)/);
  assert.match(bridge, /if \(target\.visible \|\| target\.focused\)/);
  assert.match(bridge, /this\.agentOwnedEditorWindows\.delete\(windowLabel\)/);
  assert.match(bridge, /snapshotRevision: initialSnapshot\.snapshotRevision/);
  assert.match(bridge, /did not expose semantic UI within 5 seconds/);
  assert.match(mcp, /windowLabel: args\.windowLabel \|\| 'main'/);
  assert.match(mcp, /name: 'get_window_ui'/);
  assert.match(mcp, /name: 'read_window_ui_content'/);
  assert.match(mcp, /untruncated semantic name\/description/);
  assert.match(mcp, /Continue with nextOffset until null/);
  assert.match(mcp, /expectedSnapshotRevision/);
  assert.match(mcp, /name: 'list_open_documents'/);
  assert.match(mcp, /name: 'list_editor_window_types'/);
  assert.match(bridge, /subscribeEditorWindowTypes/);
  assert.match(bridge, /this\.appendEvent\('window\.types\.changed'/);
  assert.match(mcp, /mengine:\/\/editor\/window\/types/);
  assert.match(mcp, /name: 'get_active_dialog'/);
  assert.match(mcp, /'click_window_ui'/);
  assert.match(mcp, /'double_click_window_ui'/);
  assert.match(mcp, /'open_window_ui_context_menu'/);
  assert.match(mcp, /'set_window_ui_value'/);
  assert.match(mcp, /'scroll_window_ui'/);
  assert.match(mcp, /'drag_window_ui'/);
  assert.match(mcp, /'drag_window_ui_by'/);
  assert.match(mcp, /'hover_window_ui'/);
  assert.match(mcp, /'press_window_ui_key'/);
  assert.match(mcp, /'respond_to_dialog'/);
  assert.match(mcp, /'close_editor_window'/);
  assert.match(mcp, /'open_editor_window'/);
  assert.match(bridge, /this\.appendEvent\('window\.changed'/);
  assert.match(bridge, /this\.windowObservationTimer = window\.setInterval/);
  assert.match(bridge, /private recordWindowInventory/);
  assert.match(bridge, /windows: snapshot/);
  assert.match(bridge, /if \(!openLabels\.has\(label\)\) this\.agentOwnedEditorWindows\.delete\(label\)/);
  assert.match(bridge, /closeRegisteredEditorWindow\(target\.label, false\)/);
  assert.match(mcp, /name: 'get_panel_layout'/);
  assert.match(mcp, /name: 'list_panels'/);
  assert.match(mcp, /bridgeQuery\('panel\.list'\)/);
  assert.match(mcp, /name: 'list_menu_items'/);
  assert.match(bridge, /subscribeMenuItems/);
  assert.match(bridge, /this\.appendEvent\('menu\.changed'/);
  assert.match(mcp, /mengine:\/\/editor\/menus/);
  assert.match(mcp, /'invoke_menu_item'/);
  assert.match(mcp, /name: 'list_scenes'/);
  assert.match(mcp, /name: 'preview_scene_delete'/);
  assert.match(mcp, /'rename_scene'/);
  assert.match(mcp, /'delete_scene'/);
  assert.match(mcp, /name: 'find_entities'/);
  assert.match(mcp, /name: 'get_entity_component'/);
  assert.match(mcp, /name: 'list_assets'/);
  assert.match(mcp, /name: 'read_asset_text'/);
  assert.match(mcp, /'write_asset_text'/);
  assert.match(mcp, /'import_asset_file'/);
  assert.match(mcp, /'create_asset'/);
  assert.match(mcp, /'open_asset'/);
  assert.match(mcp, /'instantiate_asset'/);
  assert.match(mcp, /name: 'get_prefab_instance'/);
  assert.match(mcp, /'create_prefab'/);
  assert.match(mcp, /'apply_prefab'/);
  assert.match(mcp, /'revert_prefab'/);
  assert.match(mcp, /'unpack_prefab'/);
  assert.match(
    mcp,
    /function execTool\(\s*name,\s*description,\s*command,\s*properties,\s*required,\s*mapArgs/,
  );
  assert.match(mcp, /ensureBridgeConnected/);
  assert.match(mcp, /sameEditorProcess/);
  assert.match(mcp, /retryAcrossEditorRestart: true/);
  assert.match(mcp, /its outcome is unknown/);
  assert.match(mcp, /class BridgeRpcError/);
  assert.match(mcp, /class BridgeOutcomeUnknownError/);
  assert.match(mcp, /BUILD_ARTIFACT_REQUEST_TIMEOUT_MS/);
  assert.match(mcp, /const longRunning = command === 'build\.verify'/);
  assert.match(mcp, /toolErrorContent/);
  assert.match(mcp, /data: error\.data/);
  assert.match(mcp, /code: 'UNKNOWN_OUTCOME'/);
  assert.match(mcp, /code: 'BRIDGE_CONNECTION'/);
  assert.match(mcp, /class ToolInputValidationError/);
  assert.match(mcp, /validateToolArguments\(tool, args\)/);
  assert.match(mcp, /additionalProperties: false/);
  assert.match(mcp, /bridgeCommand: command/);
  assert.match(mcp, /export \{[\s\S]*\bBridgeOutcomeUnknownError,/);
  assert.match(mcp, /export \{[\s\S]*\bRESOURCES,/);
  assert.match(mcp, /instructions: SERVER_INSTRUCTIONS/);
  assert.match(mcp, /protocolVersion: negotiateProtocolVersion\(params\.protocolVersion\)/);
  assert.match(mcp, /SUPPORTED_PROTOCOL_VERSIONS/);
  assert.match(mcp, /MAX_PENDING_BRIDGE_REQUESTS = 64/);
  assert.match(mcp, /MAX_ACTIVE_MCP_REQUESTS = 128/);
  assert.match(mcp, /MAX_MCP_INPUT_LINE_BYTES = 64 \* 1024 \* 1024/);
  assert.match(mcp, /MAX_MCP_OUTBOUND_QUEUED_BYTES = 192 \* 1024 \* 1024/);
  assert.match(mcp, /class BoundedNdjsonDecoder/);
  assert.match(mcp, /class BoundedWriteQueue/);
  assert.doesNotMatch(mcp, /readline\.createInterface/);
  assert.match(mcp, /case 'resources\/templates\/list'/);
  assert.match(mcp, /respondError\(null, -32700, 'Parse error'\)/);
  assert.match(mcp, /RESOURCES\.map/);
  assert.match(mcp, /editor bridge connects on first read or write/);
  assert.doesNotMatch(mcp, /async function main\(\) \{\s*const connection = await ensureBridgeConnected/);
  assert.match(mcp, /if \(!Array\.isArray\(required\)\)/);
  assert.doesNotMatch(mcp, /required = \[\]/);
  assert.match(mcp, /\.\.\.\(required\.length \? \{ required \} : \{\}\)/);
  assert.match(mcp, /'detach_panel'/);
  assert.match(mcp, /'dock_panel'/);
  assert.match(mcp, /'invoke_component_method'/);
  assert.match(mcp, /'apply_batch'/);
  assert.match(mcp, /name: 'list_intents'/);
  assert.match(mcp, /'apply_intent'/);
  assert.match(mcp, /'load_scene_json'/);
  assert.match(mcp, /'reorder_entity'/);
  assert.match(mcp, /'translate_entity'/);
  assert.match(mcp, /'set_scene_camera'/);
  for (const kind of TYPED_ENTITY_KINDS) {
    assert.match(mcp, new RegExp(`'${kind}'`));
  }
  assert.match(mcp, /expectedSceneRevision/);
  assert.match(mcp, /key !== 'screenshot'/);
  assert.match(mcp, /function screenshotContent/);
  assert.match(mcp, /screenshotContent\(result\?\.screenshot, response\)/);
  assert.match(mcp, /name: 'preview_asset_rename'/);
  assert.match(mcp, /'rename_asset'/);
  assert.match(mcp, /name: 'preview_asset_trash'/);
  assert.match(mcp, /'restore_asset'/);
  assert.match(mcp, /name: 'get_build_status'/);
  assert.match(mcp, /name: 'get_build_artifact_status'/);
  assert.match(mcp, /name: 'get_build_patches'/);
  assert.match(mcp, /name: 'compare_build_history'/);
  assert.match(mcp, /'set_build_scenes'/);
  assert.match(mcp, /'set_build_asset_policy'/);
  assert.match(mcp, /'set_game_resolution'/);
  assert.match(mcp, /'project\.settings'/);
  assert.match(mcp, /'view\.changed'/);
  assert.match(mcp, /'start_pc_build'/);
  assert.match(mcp, /'verify_pc_build'/);
  assert.match(mcp, /'create_build_history_patch'/);
  assert.match(mcp, /'restore_build_history'/);
  assert.match(mcp, /'verify_build_patch'/);
  assert.match(mcp, /name: 'get_editor_events'/);
  assert.match(mcp, /name: 'get_scene_changes'/);
  assert.match(mcp, /name: 'get_project_state'/);
  assert.match(mcp, /name: 'get_project_settings'/);
  assert.match(mcp, /'set_sorting_layers'/);
  assert.match(mcp, /'set_tags_and_layers'/);
  assert.match(mcp, /'set_entity_tag'/);
  assert.match(mcp, /'set_entity_tags'/);
  assert.match(mcp, /'set_entity_layer'/);
  assert.match(mcp, /'set_entity_layers'/);
  assert.match(mcp, /'set_entities_active'/);
  assert.match(mcp, /name: 'capture_window_region'/);
  assert.match(mcp, /name: 'capture_window_element'/);
  assert.match(mcp, /'add_component_to_entities'/);
  assert.match(mcp, /'remove_component_from_entities'/);
  assert.match(mcp, /'set_component_on_entities'/);
  assert.match(mcp, /'patch_component_on_entities'/);
  assert.match(mcp, /name: 'list_recent_projects'/);
  assert.match(mcp, /'open_project'/);
  assert.match(mcp, /'create_project'/);
  assert.match(mcp, /'close_project'/);
  assert.match(mcp, /'forget_recent_project'/);
  assert.match(mcp, /mengine:\/\/project\/state/);
  assert.match(mcp, /'step'/);
  assert.match(mcp, /'clear_console_logs'/);
  assert.match(mcp, /name: 'get_profiler_samples'/);
  assert.match(mcp, /'clear_profiler_samples'/);
  assert.match(mcp, /name: 'describe_command'/);
  assert.match(mcp, /bridgeExecute,\s*bridgeQuery,\s*closeBridgeConnection/);
});

test('the main AgentBridge transport is available before a project is opened', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const gate = fs.readFileSync(path.join(root, 'src', 'DesktopProjectGate.tsx'), 'utf8');
  const transport = fs.readFileSync(path.join(root, 'src', 'agent', 'transport.ts'), 'utf8');
  const idempotency = fs.readFileSync(
    path.join(root, 'src', 'agent', 'idempotency.ts'),
    'utf8',
  );
  const serialQueue = fs.readFileSync(
    path.join(root, 'src', 'agent', 'serialQueue.ts'),
    'utf8',
  );
  const nativeBridge = fs.readFileSync(
    path.join(root, 'src-tauri', 'src', 'agent_bridge.rs'),
    'utf8',
  );
  const nativeHost = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );
  const projectSession = fs.readFileSync(
    path.join(root, 'src', 'transport', 'desktopProjectSession.ts'),
    'utf8',
  );
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');

  assert.match(main, /attachBridgeTransport\(\)/);
  assert.match(main, /if \(detachedPanel == null && detachedEditorWindow == null\)/);
  assert.doesNotMatch(main, /useEffect/);
  assert.doesNotMatch(app, /attachBridgeTransport/);
  assert.match(transport, /agent_bridge_set_transport_ready/);
  assert.match(transport, /activation\.queuedRequests\.map\(respondToRequest\)/);
  assert.match(transport, /listen<BridgeCancelEvent>\('agent-bridge:cancel'/);
  assert.match(transport, /cancelledRequestKeys\.delete\(requestKey\)/);
  assert.match(transport, /MAX_CANCELLED_REQUEST_TOMBSTONES = 256/);
  assert.match(transport, /rememberCancelledRequest\(requestKey\)/);
  assert.match(transport, /controller\.abort\(\)/);
  assert.match(transport, /executeRequests\.run/);
  assert.match(transport, /executeQueue\.run/);
  assert.match(transport, /requireRequestId\(params\.requestId\)/);
  assert.match(idempotency, /class IdempotentRequestCache/);
  assert.match(idempotency, /class IdempotencyConflictError/);
  assert.match(idempotency, /class IdempotencyCapacityError/);
  assert.match(transport, /MAX_PENDING_EXECUTE_REQUESTS = 64/);
  assert.match(transport, /pendingWrites: error\.pendingEntries/);
  assert.match(transport, /maxPendingWrites: error\.maxPendingEntries/);
  assert.match(serialQueue, /class SerialTaskQueue/);
  assert.match(nativeBridge, /MAX_QUEUED_BRIDGE_REQUESTS: usize = 256/);
  assert.match(nativeBridge, /MAX_BRIDGE_CLIENTS: usize = 32/);
  assert.match(nativeBridge, /MAX_PENDING_REQUESTS_PER_CLIENT: usize = 64/);
  assert.match(nativeBridge, /MAX_PENDING_BRIDGE_REQUESTS: usize = 256/);
  assert.match(nativeBridge, /MAX_BRIDGE_OUTBOUND_MESSAGES: usize = 64/);
  assert.match(nativeBridge, /MAX_BRIDGE_OUTBOUND_QUEUED_BYTES: usize = 128 \* 1024 \* 1024/);
  assert.match(nativeBridge, /in_flight_request_ids: HashMap<String, usize>/);
  assert.match(nativeBridge, /cancellation_request_id_from_message/);
  assert.match(nativeBridge, /emit_bridge_cancel/);
  assert.match(nativeBridge, /MENGINE_AGENT_DANGEROUS_POLICY/);
  assert.match(nativeBridge, /MENGINE_AGENT_APPROVAL_TOKEN/);
  assert.match(nativeBridge, /DANGEROUS_AGENT_COMMANDS/);
  assert.match(nativeBridge, /authorize_request\(&text\)/);
  assert.match(nativeBridge, /"code": "PERMISSION_DENIED"/);
  assert.match(nativeBridge, /accept_hdr_async_with_config/);
  assert.doesNotMatch(nativeBridge, /unbounded_channel/);
  assert.match(nativeBridge, /bridge_not_ready_response/);
  assert.match(nativeBridge, /write_discovery_record/);
  assert.match(nativeBridge, /file\.sync_all\(\)/);
  assert.match(nativeBridge, /replace_file_atomically\(&temporary, path\)/);
  assert.match(nativeBridge, /discovery target must be a regular file/);
  assert.match(nativeBridge, /cleanup_bridge_discovery/);
  assert.match(nativeBridge, /discovery_file_is_owned/);
  assert.match(nativeHost, /PageLoadEvent::Started/);
  assert.match(nativeHost, /BridgeHub::from_environment/);
  assert.match(nativeHost, /tauri::RunEvent::Exit/);
  assert.match(nativeHost, /cleanup_bridge_discovery\(app_handle, &bridge_token_for_exit\)/);
  assert.match(gate, /connectProjectLifecycle/);
  assert.match(gate, /attachDesktopProject\(\)/);
  assert.match(gate, /errorCode\(reason\) !== 'noProject'/);
  assert.match(projectSession, /catch \(error\) \{\s*currentProject = null;/);
  assert.match(bridge, /case 'project\.state'/);
  assert.match(bridge, /case 'project\.recent'/);
  assert.match(
    bridge,
    /const argumentIssues = validateAgentJsonSchema\(args, paramsSchema\);[\s\S]*this\.assertExpectedSceneRevision/,
  );
  assert.match(bridge, /commandId === 'project\.open'/);
  assert.match(bridge, /commandId === 'project\.create'/);
  assert.match(bridge, /commandId === 'project\.forget_recent'/);
  assert.equal(
    [...bridge.matchAll(
      /commandId === 'project\.(?:open|create)'\) \{\s*const provider = this\.requireAvailableProjectLifecycle\(\);/g,
    )].length,
    2,
  );
  assert.match(bridge, /await this\.waitForEditorBootAfter\(editorBootGeneration\)/);
  assert.match(bridge, /this\.store != null && this\.editorBootReady/);
  assert.match(app, /markEditorBootReady\(store\)/);
  assert.match(bridge, /recentRevision: string/);
  assert.match(
    gate,
    /recentRevision: recentProjectsRevision\(recentProjectsRef\.current\)/,
  );
  assert.match(
    gate,
    /\[desktop, props\.detached, ready, operation, error, recentRevision\]/,
  );
  assert.match(bridge, /call close_project before opening another project/);
  assert.match(
    mcp,
    /DANGEROUS_AGENT_COMMAND_SET\.has\(command\)/,
  );
  assert.match(mcp, /bridgeExecuteParams\(command, args, options\)/);
});

test('project close is loss-aware, native-atomic, and reconnects the background bridge', () => {
  const native = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const transport = fs.readFileSync(
    path.join(root, 'src', 'transport', 'editorTransport.ts'),
    'utf8',
  );
  const projectSession = fs.readFileSync(
    path.join(root, 'src', 'transport', 'desktopProjectSession.ts'),
    'utf8',
  );
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'src', 'panels', 'MenuBar.tsx'), 'utf8');
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );

  assert.match(native, /fn close_project\(\s*discard_dirty: bool,/);
  assert.match(native, /let _lifecycle = state\.project_lifecycle\.lock\(\)/);
  assert.match(native, /session\.snapshot\(\)\.dirty && !discard_dirty/);
  assert.match(native, /\.filter\(\|\(label, _\)\| label != "main"\)/);
  assert.match(native, /window\s*\.destroy\(\)/);
  assert.match(native, /session\s*\.discard_scene_recovery\(\)/);
  assert.match(native, /let session = project\.take\(\)/);
  assert.match(native, /create_project,\s*open_project,\s*close_project,/);
  assert.match(native, /fn reserve_project_build\(/);
  assert.match(native, /\*active = Some\(build\)/);
  assert.match(transport, /invoke<CloseProjectResult>\('close_project', \{ discardDirty \}\)/);
  assert.match(
    projectSession,
    /const result = await closeProject\(discardDirty\);\s*currentProject = null;\s*resetProjectAssetState\(\)/,
  );
  assert.match(app, /if \(store\.mode !== 'edit'\)/);
  assert.match(app, /dirtyPanels\.length > 0 && !discardDirty/);
  assert.doesNotMatch(
    app,
    /await discardDesktopSceneRecovery\(\);\s*const result = await closeDesktopProject/,
  );
  assert.match(app, /const result = await closeDesktopProject\(discardDirty\)/);
  assert.match(menu, /Close Project/);
  assert.match(bridge, /commandId === 'project\.close'/);
  assert.match(
    bridge,
    /const response = await this\.finishAsyncCommand\([\s\S]*?window\.setTimeout\(\(\) => window\.location\.reload\(\), 250\);\s*return response;/,
  );
  assert.match(mcp, /'close_project'/);
  assert.match(mcp, /'project\.close'/);
  assert.match(mcp, /discardDirty=true/);
});

test('editor dialogs are non-blocking, semantic, and Agent-addressable', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const host = fs.readFileSync(path.join(root, 'src', 'EditorDialogHost.tsx'), 'utf8');
  const dialog = fs.readFileSync(path.join(root, 'src', 'editorDialog.ts'), 'utf8');
  const instance = fs.readFileSync(path.join(root, 'src', 'editorInstance.ts'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const project = fs.readFileSync(path.join(root, 'src', 'panels', 'Project.tsx'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'src', 'panels', 'BuildSettings.tsx'), 'utf8');
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );

  assert.match(main, /<EditorDialogHost \/>/);
  assert.match(host, /role="dialog"/);
  assert.match(host, /aria-modal="true"/);
  assert.match(host, /data-editor-dialog-id=\{dialog\.id\}/);
  assert.match(host, /confirmButton\.current\?\.focus\(\)/);
  assert.match(dialog, /const MAX_QUEUED_DIALOGS = 64/);
  assert.match(dialog, /export function getActiveEditorDialog/);
  assert.match(dialog, /export function listEditorDialogs/);
  assert.match(dialog, /export function respondToEditorDialog/);
  assert.match(dialog, /createEditorBroadcastChannel\(DIALOG_CHANNEL_NAME\)/);
  assert.match(main, /initializeEditorInstance\(await getEditorInstanceId\(\)\)/);
  assert.match(instance, /new BroadcastChannel\(editorBroadcastChannelName\(baseName\)\)/);
  assert.match(dialog, /respondToEditorDialogInWindow/);
  assert.match(app, /type: 'scene-library-changed'/);
  assert.match(app, /refreshSceneLibrary\(\)/);
  assert.match(app, /postSceneLibraryChanged\(\)/);
  assert.match(bridge, /commandId === 'dialog\.respond'/);
  assert.match(bridge, /case 'dialog\.state'/);
  assert.match(bridge, /case 'dialog\.list'/);
  assert.match(bridge, /this\.appendEvent\('dialog\.changed'/);
  assert.match(mcp, /name: 'get_active_dialog'/);
  assert.match(mcp, /name: 'list_active_dialogs'/);
  assert.match(mcp, /'respond_to_dialog'/);
  assert.match(mcp, /windowLabel: args\.windowLabel \|\| 'main'/);
  for (const source of [app, project, build]) {
    assert.doesNotMatch(source, /window\.(?:alert|confirm|prompt)\(/);
  }
});

test('Inspector controls expose context-specific Agent semantic names', () => {
  const inspector = fs.readFileSync(
    path.join(root, 'src', 'panels', 'Inspector.tsx'),
    'utf8',
  );

  assert.match(
    inspector,
    /aria-label=\{`\$\{props\.title\} Context Menu`\}/,
  );
  assert.match(
    inspector,
    /function axisSemanticLabel\(scope: string, field: string, axis: string\)/,
  );
  assert.match(
    inspector,
    /axisSemanticLabel\('Surface Shader', parameter\.label, axis\)/,
  );
  assert.equal(
    [...inspector.matchAll(
      /axisSemanticLabel\('Transform', '(?:Position|Rotation|Scale)', '[xyz]'\)/g,
    )].length,
    9,
  );
  assert.equal(
    [...inspector.matchAll(
      /axisSemanticLabel\('Rect Transform', '(?:Position|Size|Rotation|Scale)'/g,
    )].length,
    4,
  );
  assert.match(
    inspector,
    /axisSemanticLabel\(\s*'Transform',\s*field\[0\]\.toUpperCase\(\) \+ field\.slice\(1\),\s*\(\['x', 'y', 'z'\] as const\)\[axis\],\s*\)/,
  );
  assert.match(inspector, /aria-label="Camera 3D Primary"/);
  assert.match(inspector, /aria-label=\{semanticLabel\}/);
});

test('every cross-window editor channel is isolated by native editor instance', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const files = [
    'App.tsx',
    'assetEditorEvents.ts',
    'buildEditorEvents.ts',
    'editorDialog.ts',
    'editorProfiler.ts',
    'sortingLayers.ts',
    path.join('panels', 'detachedPanelWindow.ts'),
  ].map((file) => fs.readFileSync(path.join(root, 'src', file), 'utf8'));

  for (const source of files) {
    assert.match(source, /createEditorBroadcastChannel/);
    assert.doesNotMatch(source, /new BroadcastChannel/);
  }
  assert.match(main, /initializeBuildEditorEvents\(\)/);
});

test('Project Settings editor shares the Agent revision guard and preserves dirty drafts', () => {
  const projectSettings = fs.readFileSync(
    path.join(root, 'src', 'panels', 'ProjectSettings.tsx'),
    'utf8',
  );
  assert.match(projectSettings, /loadSortingLayersSnapshot\(\)/);
  assert.match(projectSettings, /persistProjectSettingsGuarded\([\s\S]*revision,[\s\S]*'project-settings'/);
  assert.match(projectSettings, /if \(!discardDraft && dirtyRef\.current\)/);
  assert.match(projectSettings, /Project Settings changed outside this editor/);
  assert.doesNotMatch(projectSettings, /\bpersistProjectSettings\(/);
});

test('panel and menu agent surfaces use live providers and background activation', () => {
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const registry = fs.readFileSync(path.join(root, 'src', 'editorWindow', 'registry.ts'), 'utf8');
  const importer = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'assetImportMenuItem.ts'),
    'utf8',
  );
  const prefabMenu = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'prefabMenuItems.ts'),
    'utf8',
  );
  const nativeWindow = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'nativeEditorWindow.ts'),
    'utf8',
  );
  const decorator = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'windows', 'DecoratorGalleryWindow.tsx'),
    'utf8',
  );
  const documentation = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'windows', 'DocumentationWindow.tsx'),
    'utf8',
  );
  const popup = fs.readFileSync(path.join(root, 'src', 'panels', 'PopupMenu.tsx'), 'utf8');
  const gate = fs.readFileSync(path.join(root, 'src', 'DesktopProjectGate.tsx'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'src', 'panels', 'MenuBar.tsx'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'src', 'panels', 'BuildSettings.tsx'), 'utf8');
  const project = fs.readFileSync(path.join(root, 'src', 'panels', 'Project.tsx'), 'utf8');
  const dock = fs.readFileSync(path.join(root, 'src', 'panels', 'DockWorkspace.tsx'), 'utf8');
  const detached = fs.readFileSync(
    path.join(root, 'src', 'panels', 'detachedPanelWindow.ts'),
    'utf8',
  );
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');

  assert.match(bridge, /case 'panel\.get_layout'/);
  assert.match(bridge, /case 'workspace\.documents'/);
  assert.match(bridge, /commandId === 'asset\.open'/);
  assert.match(bridge, /assertPanelWindowMutationAllowed\('asset\.open', \[windowLabel\]\)/);
  assert.match(bridge, /commandId === 'panel\.detach'/);
  assert.match(bridge, /assertPanelWindowMutationAllowed\('panel\.detach', \['main'\]\)/);
  assert.match(bridge, /assertPanelWindowMutationAllowed\([\s\S]*'panel\.dock'/);
  assert.match(bridge, /detachPanelWindow\(panel, undefined, false\)/);
  assert.match(
    bridge,
    /lastNativeWindowPresent = \(await this\.listWindows\(\)\)\.some/,
  );
  assert.match(
    bridge,
    /lastLayoutDetached === expected[\s\S]*lastNativeWindowPresent === expected/,
  );
  assert.match(bridge, /if \(commandId === 'panel\.focus'\)/);
  assert.match(bridge, /assertPanelWindowMutationAllowed\('panel\.focus', \['main'\]\)/);
  assert.match(bridge, /unchanged: true/);
  assert.match(bridge, /const focused = await this\.waitForPanelFocused\(panel\)/);
  assert.match(bridge, /this\.finishAsyncCommand\(result, options, focused\.windowLabel\)/);
  assert.match(bridge, /if \(commandId === 'panel\.reset_layout'\)/);
  assert.match(bridge, /assertPanelWindowMutationAllowed\([\s\S]*'panel\.reset_layout'/);
  assert.match(bridge, /const layout = await this\.waitForPanelLayoutReset\(\)/);
  assert.match(bridge, /this\.finishAsyncCommand\(result, options, 'main'\)/);
  assert.match(bridge, /case 'menu\.list'/);
  assert.match(bridge, /commandId === 'menu\.invoke'/);
  assert.match(bridge, /if \(!entry\.agentInvokable\)/);
  assert.match(bridge, /source: 'agent'/);
  assert.match(bridge, /activateWindow: false/);
  assert.match(registry, /agentInvokable: options\.agentInvokable/);
  assert.match(importer, /agentInvokable: false/);
  assert.match(importer, /agentAlternative: 'import_asset_file'/);
  assert.equal([...prefabMenu.matchAll(/agentInvokable: false/g)].length, 4);
  for (const alternative of [
    'create_prefab',
    'apply_prefab',
    'revert_prefab',
    'unpack_prefab',
  ]) {
    assert.match(prefabMenu, new RegExp(`agentAlternative: '${alternative}'`));
  }
  assert.match(nativeWindow, /visible: activateWindow/);
  assert.match(nativeWindow, /focus: activateWindow/);
  assert.match(decorator, /context\.source !== 'agent'/);
  assert.match(decorator, /agentInvokable: false/);
  assert.match(decorator, /agentAlternative: 'open_editor_window'/);
  assert.match(documentation, /agentInvokable: false/);
  assert.match(documentation, /agentAlternative: 'open_editor_window'/);
  assert.equal([...dock.matchAll(/agentAlternative: 'focus_panel'/g)].length, 2);
  assert.match(dock, /agentAlternative: 'reset_panel_layout'/);
  assert.match(
    dock,
    /closeAllDetachedPanelWindows\(\)[\s\S]*\.then\(\(\) => setTree\(defaultTree\(\)\)\)/,
  );
  assert.match(popup, /data-agent-interaction=/);
  assert.match(popup, /const canExpand = hasChildren && enabled/);
  assert.match(popup, /aria-label=\{canExpand \? `Open \$\{node\.label\} submenu` : undefined\}/);
  assert.match(popup, /onPointerEnter=\{canExpand \? \(event\) =>/);
  assert.match(popup, /onPointerLeave=\{canExpand \? \(\) => setExpanded\(false\) : undefined\}/);
  assert.match(gate, /data-agent-alternative="open_project"/);
  assert.match(gate, /data-agent-alternative="create_project"/);
  assert.equal(
    [...menu.matchAll(/data-agent-alternative="close_project"/g)].length,
    2,
  );
  assert.equal(
    [...build.matchAll(/data-agent-interaction="blocked"/g)].length,
    4,
  );
  assert.match(build, /data-agent-alternative="run_pc_player"/);
  assert.match(build, /data-agent-alternative="start_pc_build"/);
  assert.match(project, /a\.kind === 'script' \? 'doubleClick keyPress'/);
  assert.match(project, /data-agent-alternative=\{a\.kind === 'script' \? 'read_asset_text'/);
  assert.match(
    project,
    /data-agent-alternative="import_asset_file"[\s\S]*?void completeImport\(\)/,
  );
  assert.match(
    project,
    /role="menu"\s*aria-label=\{ctx\.asset \? `\$\{ctx\.asset\.name\} asset context menu` : `\$\{folder\} context menu`\}/,
  );
  assert.match(project, /role="tree" aria-label="Project folders"/);
  assert.match(project, /role="treeitem"/);
  assert.match(project, /aria-label=\{f\}/);
  assert.match(project, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(dock, /describePanelLayout\(tree\)/);
  assert.match(dock, /rawDetail\?\.activateWindow !== false/);
  assert.equal(
    [...dock.matchAll(/activateWindow: context\.source !== 'agent'/g)].length,
    2,
  );
  assert.match(detached, /visible: activateWindow/);
  assert.match(detached, /focus: activateWindow/);
  assert.match(app, /\.\.\.resourceDocumentPathsRef\.current/);
  assert.match(app, /setMaterialPath\(message\.materialPath \?\? null\)/);
  assert.match(app, /openAsset: async \(target: AgentResourceEditorTarget\)/);
  assert.match(app, /resourceEditorPreservesDrafts\(target\.kind\)/);
  assert.match(app, /locallyDirty && !preservesDrafts/);
  assert.match(app, /remoteDirty\.includes\(target\.panel\) && !preservesDrafts/);
  assert.match(app, /createAsset: async \(request: AgentCreateAssetRequest\)/);
  assert.match(app, /instantiateAsset: async \(target: AgentInstantiableAssetTarget\)/);
  assert.match(app, /type: 'request-save-resources'/);
  assert.match(app, /type: 'save-resources-result'/);
  assert.match(app, /paths\?: string\[\]/);
  assert.match(app, /operation\?: ResourceDocumentOperation/);
  assert.match(app, /saveDocument: async \(requestedPath: string\)/);
  assert.match(app, /discardDocument: async \(requestedPath: string\)/);
  assert.match(app, /reloadDocument: async \(requestedPath: string\)/);
  assert.match(app, /closeDocument: async \(/);
  assert.match(app, /allowedDirtyActions: \['save', 'discard'\]/);
  assert.match(app, /coordinator\.request\([\s\S]*?\[canonicalPath\]/);
  assert.match(app, /\[canonicalPath\],[\s\S]*?'discard'/);
  assert.match(app, /\[canonicalPath\],[\s\S]*?'close'/);
  assert.match(app, /Multiple editor windows contain dirty drafts/);
  assert.match(app, /waitForLocalResourceDocumentClean\(canonicalPath\)/);
  assert.match(app, /waitForLocalResourceDocumentDiscarded\(canonicalPath\)/);
  assert.match(app, /waitForLocalResourceDocumentClosed\(canonicalPath\)/);
  assert.match(
    app,
    /await agentWorkspaceProviderRef\.current!\.openAsset\(target\)/,
  );
  assert.match(app, /projectAssetHasExternalWriteConflict\(document\.path\)/);
  assert.match(app, /if \(target\.document\.conflicted\)/);
  assert.match(app, /await saveRemoteResources\(\)/);
  assert.match(app, /Workspace remains dirty after its Save All participants completed/);
  assert.match(app, /agentBridge\.observeWorkspace\(\)/);
  assert.match(bridge, /this\.appendEvent\('workspace\.changed', result\)/);
  assert.match(bridge, /commandId === 'workspace\.reload_document'/);
  assert.match(bridge, /waitForWorkspaceDocument\(result\.target\)/);
});

test('resource editors register exact document save, discard, and close participants', () => {
  const saveAll = fs.readFileSync(path.join(root, 'src', 'saveAll.ts'), 'utf8');
  const editors = [
    'Timeline.tsx',
    'Sequencer.tsx',
    'Animator.tsx',
    'AvatarMask.tsx',
    'Material.tsx',
    'MaterialInstance.tsx',
    'SurfaceShader.tsx',
    'SpriteEditor.tsx',
    'SpriteAtlasEditor.tsx',
  ];

  assert.match(saveAll, /SAVE_RESOURCE_DOCUMENT_EVENT/);
  assert.match(saveAll, /DISCARD_RESOURCE_DOCUMENT_EVENT/);
  assert.match(saveAll, /CLOSE_RESOURCE_DOCUMENT_EVENT/);
  assert.match(saveAll, /request\.tasks\.length > 1/);
  for (const editor of editors) {
    const source = fs.readFileSync(path.join(root, 'src', 'panels', editor), 'utf8');
    assert.match(
      source,
      /registerSaveDocumentParticipant\(/,
      `${editor} must claim exact document save requests`,
    );
    assert.match(
      source,
      /registerDiscardDocumentParticipant\(/,
      `${editor} must claim exact document discard requests`,
    );
    assert.match(
      source,
      /registerCloseDocumentParticipant\(/,
      `${editor} must claim exact document close requests`,
    );
    assert.match(
      source,
      /sameSaveDocumentPath\(/,
      `${editor} must compare paths consistently`,
    );
  }
  for (const editor of editors.slice(0, 7)) {
    const source = fs.readFileSync(path.join(root, 'src', 'panels', editor), 'utf8');
    assert.match(
      source,
      /\[\.\.\.drafts\.current\]\.find/,
      `${editor} must support saving an inactive cached draft`,
    );
    assert.match(
      source,
      /undoService\.clear\(/,
      `${editor} must clear the discarded document undo scope`,
    );
    assert.match(
      source,
      /closingPath\.current/,
      `${editor} must not recache a closing current document`,
    );
  }
  for (const editor of editors.filter((name) => name !== 'SpriteEditor.tsx')) {
    const source = fs.readFileSync(path.join(root, 'src', 'panels', editor), 'utf8');
    assert.match(
      source,
      /replaceWriteBaseline: true/,
      `${editor} must replace its write baseline only when loading the authored document`,
    );
  }
});

test('workspace documents include cached resource drafts with exact per-document state', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const draftEditors = [
    'Timeline.tsx',
    'Sequencer.tsx',
    'Animator.tsx',
    'AvatarMask.tsx',
    'Material.tsx',
    'MaterialInstance.tsx',
    'SurfaceShader.tsx',
  ];

  assert.match(app, /documents: structuredClone\(localResourceDocumentsRef\.current\)/);
  assert.match(
    app,
    /mergeWorkspaceResourceDocuments\(\s*localResourceDocumentsRef\.current,\s*\.\.\.remotePeers\.map\(\(peer\) => peer\.documents\),\s*\)/,
  );
  assert.match(app, /documents\.push\(\.\.\.resourceDocuments\)/);
  assert.doesNotMatch(app, /dirty: document\.dirty \|\| remoteDirty\.has\(document\.panel\)/);
  assert.match(
    bridge,
    /conflicted = false,[\s\S]*?selected = true,[\s\S]*?\.\.\.visibleDocument/,
  );
  assert.match(bridge, /conflicted,[\s\S]*?active: selected &&/);
  assert.match(
    bridge,
    /active: selected && \(\s*detachedWindow !== undefined \|\| activePanels\.has\(document\.panel\)\s*\)/,
  );
  for (const file of draftEditors) {
    const source = fs.readFileSync(path.join(root, 'src', 'panels', file), 'utf8');
    assert.match(source, /resourceEditorDocuments\(/, file);
    assert.match(source, /onDocumentsChange/, file);
    assert.match(
      source,
      /drafts\.current\.set\(previous(?:Path)?[\s\S]{0,600}?setDraftEpoch/,
      file,
    );
    assert.match(
      source,
      /dropChangedCleanDrafts\(/,
      `${file} must invalidate clean cached drafts after external changes`,
    );
  }
});

test('authored resource factories can create without opening or activating their editor', () => {
  const factories = [
    ['Material.tsx', /if \(open\) openMaterialAsset\(path\)/],
    ['MaterialInstance.tsx', /if \(open\) openMaterialAsset\(path\)/],
    ['SurfaceShader.tsx', /if \(open\) openSurfaceShaderAsset\(path\)/],
    ['Timeline.tsx', /if \(open\) openAnimationClipAsset\(path\)/],
    ['Animator.tsx', /if \(open\) openAnimatorAsset\(controllerPath\)/],
    ['SpriteAtlasEditor.tsx', /if \(open\) openSpriteAtlasAsset\(path\)/],
    ['AvatarMask.tsx', /if \(open\) openAnimatorAsset\(path\)/],
    ['Sequencer.tsx', /if \(open\) openTimelineAsset\(path\)/],
  ];
  for (const [file, openGuard] of factories) {
    const source = fs.readFileSync(path.join(root, 'src', 'panels', file), 'utf8');
    assert.match(source, /open = true/);
    assert.match(source, openGuard);
  }
  const animator = fs.readFileSync(path.join(root, 'src', 'panels', 'Animator.tsx'), 'utf8');
  const materialInstance = fs.readFileSync(
    path.join(root, 'src', 'panels', 'MaterialInstance.tsx'),
    'utf8',
  );
  assert.match(animator, /createdPaths: \[clipPath, controllerPath\]/);
  assert.match(materialInstance, /createdPaths\.push\(parent\)/);
  assert.match(materialInstance, /createdPaths\.push\(path\)/);
});

test('scene, asset, and asynchronous build tools share guarded editor services', () => {
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const commands = fs.readFileSync(path.join(root, 'src', 'agent', 'commands.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const assets = fs.readFileSync(path.join(root, 'src', 'projectAssets.ts'), 'utf8');
  const store = fs.readFileSync(path.join(root, 'src', 'store.ts'), 'utf8');
  const viewport = fs.readFileSync(path.join(root, 'src', 'panels', 'Viewport.tsx'), 'utf8');
  const timeline = fs.readFileSync(path.join(root, 'src', 'panels', 'Timeline.tsx'), 'utf8');
  const sequencer = fs.readFileSync(path.join(root, 'src', 'panels', 'Sequencer.tsx'), 'utf8');
  const spriteEditor = fs.readFileSync(path.join(root, 'src', 'panels', 'SpriteEditor.tsx'), 'utf8');
  const buildSettings = fs.readFileSync(
    path.join(root, 'src', 'panels', 'BuildSettings.tsx'),
    'utf8',
  );
  const eventJournal = fs.readFileSync(
    path.join(root, 'src', 'agent', 'eventJournal.ts'),
    'utf8',
  );
  const assetOperations = fs.readFileSync(
    path.join(root, 'src', 'agent', 'assetOperations.ts'),
    'utf8',
  );
  const viteFs = fs.readFileSync(
    path.join(root, 'vite', 'mengineFsPlugin.ts'),
    'utf8',
  );
  const prefabWorkflow = fs.readFileSync(
    path.join(root, 'src', 'prefabWorkflow.ts'),
    'utf8',
  );
  const native = fs.readFileSync(
    path.join(root, 'src-tauri', 'src', 'lib.rs'),
    'utf8',
  );
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );

  assert.match(bridge, /case 'scene\.list'/);
  assert.match(bridge, /case 'commands\.describe'/);
  assert.match(bridge, /case 'scene\.delete_preview'/);
  assert.match(bridge, /case 'entity\.find'/);
  assert.match(bridge, /case 'entity\.get_component'/);
  assert.match(commands, /'batch\.apply'/);
  assert.match(commands, /worldCommandBatch/);
  assert.match(store, /cmd\.op === 'removeComponent'/);
  assert.match(bridge, /commandId === 'scene\.new'/);
  assert.match(bridge, /commandId === 'asset\.create'/);
  assert.match(bridge, /commandId === 'scene\.rename'/);
  assert.match(bridge, /commandId === 'scene\.delete'/);
  assert.match(bridge, /Scene deletion preview is stale/);
  assert.match(bridge, /case 'asset\.read_text'/);
  assert.match(bridge, /commandId === 'asset\.write_text'/);
  assert.match(bridge, /commandId === 'asset\.import_file'/);
  assert.match(bridge, /case 'project\.settings'/);
  assert.match(bridge, /case 'project\.script_diagnostics'/);
  assert.match(bridge, /validateProjectScripts\(\)/);
  assert.match(native, /async fn validate_project_scripts\(/);
  assert.match(native, /hide_child_process_window\(&mut command\)/);
  assert.match(mcp, /mengine:\/\/project\/script\/diagnostics/);
  assert.match(mcp, /name: 'validate_project_scripts'/);
  assert.match(bridge, /commandId === 'project\.settings\.set_sorting_layers'/);
  assert.match(bridge, /commandId === 'project\.settings\.set_tags_and_layers'/);
  assert.match(bridge, /persistSortingLayersGuarded/);
  assert.match(bridge, /persistTagsAndLayersGuarded/);
  assert.match(bridge, /staleSortingLayerRevision/);
  assert.match(bridge, /case 'prefab\.instance'/);
  assert.match(bridge, /commandId === 'prefab\.create'/);
  assert.match(bridge, /commandId === 'prefab\.apply'/);
  assert.match(bridge, /commandId === 'prefab\.revert'/);
  assert.match(bridge, /commandId === 'prefab\.unpack'/);
  assert.match(bridge, /allowSceneDirty: true/);
  assert.match(bridge, /stalePrefabRevision/);
  assert.match(prefabWorkflow, /writeProjectAssetText\(path, serializePrefabAsset\(captured\.asset\), null\)/);
  assert.match(prefabWorkflow, /expectedRevision\?: string/);
  assert.match(prefabWorkflow, /readProjectAssetBytesWithRevision\(instance\.source\)/);
  assert.match(bridge, /importExternalProjectAsset\(sourcePath, normalized\)/);
  assert.match(bridge, /assertDiskMutationAllowed/);
  assert.match(commands, /'component\.invoke'/);
  assert.match(commands, /'entity\.reorder'/);
  assert.match(commands, /'transform\.translate'/);
  assert.match(commands, /'view\.set_camera'/);
  assert.match(commands, /'view\.set_game_resolution'/);
  assert.match(bridge, /sceneCamera: store\.sceneCamera/);
  assert.match(
    bridge,
    /const view = \{\s+gizmo: store\.gizmo,\s+sceneCamera: store\.sceneCamera,\s+sceneView: readSceneViewPreferences\(\),\s+timelinePreferences: readTimelineEditorPreferences\(\),\s+gameResolution: store\.gameResolution,\s+\};/,
  );
  assert.match(bridge, /SCENE_VIEW_PREFERENCES_CHANGED_EVENT/);
  assert.match(bridge, /updateSceneViewPreferences\(patch\)/);
  assert.match(bridge, /commandId === 'view\.set_scene_preferences'/);
  assert.match(bridge, /TIMELINE_EDITOR_PREFERENCES_CHANGED_EVENT/);
  assert.match(bridge, /timelinePreferences: readTimelineEditorPreferences\(\)/);
  assert.match(bridge, /updateTimelineEditorPreferences\(patch\)/);
  assert.match(bridge, /commandId === 'view\.set_timeline_preferences'/);
  assert.match(timeline, /updateTimelineEditorPreferences\(\{/);
  assert.match(sequencer, /updateTimelineEditorPreferences\(\{/);
  assert.doesNotMatch(timeline, /localStorage\.setItem/);
  assert.doesNotMatch(sequencer, /localStorage\.setItem/);
  assert.match(bridge, /case 'sprite\.import_settings'/);
  assert.match(bridge, /commandId === 'sprite\.import_settings\.set'/);
  assert.match(bridge, /normalizeSpriteImportSettings/);
  assert.match(bridge, /current\.revision !== expectedRevision/);
  assert.match(spriteEditor, /writeProjectAssetText\(importPath, text, savedRevision\)/);
  assert.match(spriteEditor, /PROJECT_ASSETS_CHANGED_EVENT/);
  assert.match(app, /updateSceneViewPreferences\(\{ pivotMode: next \}\)/);
  assert.match(app, /updateSceneViewPreferences\(\{ handleOrientation: next \}\)/);
  assert.match(bridge, /setEditorPrefs\(\{ gameResolution: resolution \}\)/);
  assert.match(bridge, /status: 'running'/);
  assert.match(bridge, /listenToPcBuildProgress/);
  assert.match(bridge, /case 'build\.status'/);
  assert.match(bridge, /case 'build\.artifact_status'/);
  assert.match(bridge, /'STALE_REVISION'/);
  assert.match(bridge, /result\.sceneRevision = this\.sceneChanges\.revision/);
  assert.match(bridge, /commandId === 'build\.settings\.set_scenes'/);
  assert.match(bridge, /commandId === 'build\.settings\.set_asset_policy'/);
  assert.match(bridge, /staleBuildSettingsRevision/);
  assert.match(bridge, /availableScenes/);
  assert.match(bridge, /commandId === 'build\.verify'/);
  assert.match(bridge, /verifyPcPlayer\(executable, expectedContentHash\)/);
  assert.match(bridge, /commandId === 'build\.run'/);
  assert.match(bridge, /args\.allowForegroundLaunch !== true/);
  assert.match(bridge, /runPcPlayer\(executable\)/);
  assert.match(bridge, /case 'build\.patches'/);
  assert.match(bridge, /case 'build\.history\.compare'/);
  assert.match(bridge, /commandId === 'build\.history\.create_patch'/);
  assert.match(bridge, /commandId === 'build\.history\.restore'/);
  assert.match(bridge, /commandId === 'build\.patch\.verify'/);
  assert.match(bridge, /requiredAbsolutePath\(args, 'publicKeyPath'\)/);
  assert.match(bridge, /private startBuildArtifactJob/);
  assert.match(bridge, /cancellable: false/);
  assert.match(buildSettings, /PROJECT_BUILD_ARTIFACTS_CHANGED_EVENT/);
  assert.match(buildSettings, /broadcastProjectBuildArtifactsChanged\(\{/);
  assert.match(buildSettings, /PROJECT_BUILD_SETTINGS_CHANGED_EVENT/);
  assert.match(bridge, /PROJECT_BUILD_ARTIFACTS_CHANGED_EVENT/);
  assert.match(bridge, /PROJECT_BUILD_SETTINGS_CHANGED_EVENT/);
  assert.equal(
    [...bridge.matchAll(/this\.appendEvent\(\s*'build\.settings'/g)].length,
    1,
  );
  assert.match(bridge, /this\.appendEvent\(\s*'build\.artifacts'/);
  assert.match(eventJournal, /'build\.settings'/);
  assert.match(eventJournal, /'build\.artifacts'/);
  assert.match(eventJournal, /'project\.settings'/);
  assert.match(bridge, /SORTING_LAYERS_CHANGED_EVENT/);
  assert.match(bridge, /this\.appendEvent\(\s*'project\.settings'/);
  assert.match(eventJournal, /'view\.changed'/);
  assert.match(app, /connectSceneCommands/);
  assert.match(app, /rename: async \(\{ oldName: rawOldName, newName: rawNewName \}\)/);
  assert.match(app, /delete: async \(\{ name: rawName, expectedRevision \}\)/);
  assert.match(app, /deleteScene\(name, expectedRevision\)/);
  assert.match(
    app,
    /\(!options\.allowSceneDirty && sceneDirtyRef\.current\) \|\| resourceDirtyRef\.current/,
  );
  assert.match(app, /pass discardDirty=true/);
  assert.match(assets, /expectedRevision === undefined/);
  assert.match(store, /if \(mode === 'pause'\) \{\s*mode = 'play'/);
  assert.match(store, /step\(dt = 1 \/ 60\)/);
  assert.match(store, /simulationTime: playSpin/);
  assert.match(bridge, /simulationTime: snapshot\.simulationTime/);
  assert.match(viewport, /sampleViewportSimulationClock/);
  assert.match(viewport, /resolveAnimatedSpriteFrame\(animatedSprite, animationTime\)/);
  assert.match(viewport, /deltaSeconds: simulationDelta/);
  assert.match(bridge, /case 'scene\.diff'/);
  assert.match(bridge, /case 'events\.get'/);
  assert.match(bridge, /agent_bridge_broadcast/);
  assert.match(eventJournal, /truncated: afterSequence < oldestSequence - 1/);
  assert.match(assetOperations, /previewToken/);
  assert.match(assetOperations, /requireCurrentPreview/);
  assert.match(assetOperations, /allowManualReferences/);
  assert.match(assetOperations, /manifestReferences/);
  assert.match(assetOperations, /referenceScanTruncated/);
  assert.match(assetOperations, /PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT/);
  assert.equal(
    [...bridge.matchAll(/this\.appendEvent\(\s*'asset\.changed'/g)].length,
    1,
  );
  assert.match(viteFs, /implicitStartupScript/);
  assert.match(viteFs, /materializeImplicitStartupScript/);
  assert.match(viteFs, /sorting-layers-snapshot/);
  assert.match(viteFs, /sorting-layers-guarded/);
  assert.match(native, /get_project_sorting_layers_snapshot/);
  assert.match(native, /save_project_sorting_layers_guarded/);
  assert.match(native, /write_sorting_layers_guarded/);
  assert.match(viteFs, /collectEffectiveManifestAssetReferences/);
});
