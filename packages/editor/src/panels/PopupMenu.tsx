import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent, MouseEvent } from 'react';
import type { MenuItemContext, MenuItemEntry } from '../editorWindow';

type MenuTreeNode = {
  key: string;
  label: string;
  priority: number;
  separatorBefore: boolean;
  entry?: MenuItemEntry;
  children: MenuTreeNode[];
};

function buildMenuTree(entries: readonly MenuItemEntry[]): MenuTreeNode[] {
  const root: MenuTreeNode = {
    key: '',
    label: '',
    priority: Number.MAX_SAFE_INTEGER,
    separatorBefore: false,
    children: [],
  };

  for (const entry of entries) {
    let parent = root;
    const relativeSegments = entry.segments.slice(1);
    relativeSegments.forEach((segment, index) => {
      const key = `${parent.key}/${segment}`;
      let node = parent.children.find((child) => child.label === segment);
      if (!node) {
        node = {
          key,
          label: segment,
          priority: entry.priority,
          separatorBefore: false,
          children: [],
        };
        parent.children.push(node);
      }
      node.priority = Math.min(node.priority, entry.priority);
      if (index === relativeSegments.length - 1) {
        node.entry = entry;
        node.separatorBefore = entry.separatorBefore;
      }
      parent = node;
    });
  }

  const finalize = (nodes: MenuTreeNode[]): MenuTreeNode[] => {
    for (const node of nodes) {
      node.children = finalize(node.children);
      if (!node.entry && node.children[0]?.separatorBefore) {
        node.separatorBefore = true;
      }
    }
    return nodes.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
  };

  return finalize(root.children);
}

function isEnabled(entry: MenuItemEntry | undefined, context: MenuItemContext): boolean {
  if (!entry) return false;
  if (!entry.validate) return true;
  try {
    return entry.validate(context);
  } catch (error) {
    console.error(`[MenuItem] validation failed: ${entry.path}`, error);
    return false;
  }
}

function hasEnabledAction(node: MenuTreeNode, context: MenuItemContext): boolean {
  return isEnabled(node.entry, context) || node.children.some((child) => hasEnabledAction(child, context));
}

function MenuNode(props: {
  node: MenuTreeNode;
  context: MenuItemContext;
  onSelect: () => void;
}) {
  const { node, context } = props;
  const nodeRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
  const [submenuTop, setSubmenuTop] = useState(-5);
  const hasChildren = node.children.length > 0;
  const enabled = hasChildren
    ? node.children.some((child) => hasEnabledAction(child, context))
    : isEnabled(node.entry, context);

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!enabled) return;
    if (hasChildren) {
      setExpanded(true);
      return;
    }
    if (!node.entry) return;
    props.onSelect();
    try {
      void Promise.resolve(node.entry.action(context)).catch((error) => {
        console.error(`[MenuItem] action failed: ${node.entry?.path}`, error);
      });
    } catch (error) {
      console.error(`[MenuItem] action failed: ${node.entry.path}`, error);
    }
  };

  useLayoutEffect(() => {
    if (!expanded) return;
    const anchor = nodeRef.current?.getBoundingClientRect();
    const submenu = submenuRef.current?.getBoundingClientRect();
    if (!anchor || !submenu) return;
    const padding = 4;
    const spaceRight = window.innerWidth - anchor.right + 4;
    const spaceLeft = anchor.left + 4;
    const shouldOpenLeft = spaceRight < submenu.width && spaceLeft > spaceRight;
    if (shouldOpenLeft !== openLeft) {
      setOpenLeft(shouldOpenLeft);
      return;
    }
    const desiredTop = Math.max(
      padding,
      Math.min(anchor.top - padding, window.innerHeight - submenu.height - padding),
    );
    setSubmenuTop(desiredTop - anchor.top);
  }, [expanded, openLeft, node.children.length]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setExpanded(false);
  };

  const submenuStyle = { top: submenuTop } as CSSProperties;

  return (
    <div
      ref={nodeRef}
      className={`popup-menu-node${hasChildren ? ' has-children' : ''}${expanded ? ' is-open' : ''}`}
      onPointerEnter={(event) => {
        if (!hasChildren) return;
        const rect = event.currentTarget.getBoundingClientRect();
        // Fast first placement; layout measurement below corrects for wider custom labels.
        setOpenLeft(rect.right + 224 > window.innerWidth);
        setExpanded(true);
      }}
      onPointerLeave={() => setExpanded(false)}
      onFocusCapture={() => hasChildren && setExpanded(true)}
      onBlurCapture={onBlur}
    >
      <button
        type="button"
        className="popup-menu-row"
        disabled={!enabled}
        role="menuitem"
        aria-haspopup={hasChildren ? 'menu' : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={onClick}
      >
        <span>{node.label}</span>
        {hasChildren ? (
          <span className="popup-menu-arrow" aria-hidden="true">{openLeft ? '‹' : '›'}</span>
        ) : node.entry?.shortcut ? (
          <span className="hint">{node.entry.shortcut}</span>
        ) : null}
      </button>
      {hasChildren && enabled && (
        <div
          ref={submenuRef}
          className={`popup-submenu${openLeft ? ' open-left' : ''}`}
          style={submenuStyle}
          role="menu"
        >
          <MenuNodes nodes={node.children} context={context} onSelect={props.onSelect} />
        </div>
      )}
    </div>
  );
}

function MenuNodes(props: {
  nodes: readonly MenuTreeNode[];
  context: MenuItemContext;
  onSelect: () => void;
}) {
  return props.nodes.map((node, index) => (
    <Fragment key={node.key}>
      {index > 0 && node.separatorBefore && <div className="sep" role="separator" />}
      <MenuNode node={node} context={props.context} onSelect={props.onSelect} />
    </Fragment>
  ));
}

export function PopupMenuItems(props: {
  entries: readonly MenuItemEntry[];
  context: MenuItemContext;
  onSelect: () => void;
}) {
  const tree = useMemo(() => buildMenuTree(props.entries), [props.entries]);
  return <MenuNodes nodes={tree} context={props.context} onSelect={props.onSelect} />;
}
