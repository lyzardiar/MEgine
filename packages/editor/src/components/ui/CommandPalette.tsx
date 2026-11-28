import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Command,
  LayoutGrid,
  Search,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n';

export type PaletteAction = {
  id: string;
  group: 'commands' | 'panels' | 'entities';
  label: string;
  subtitle?: string;
  keywords?: string;
  run: () => void;
};

export function CommandPalette(props: {
  open: boolean;
  actions: readonly PaletteAction[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.open) {
      setQuery('');
      setActiveIndex(0);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [props.open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.actions.slice(0, 40);
    return props.actions
      .filter((item) => {
        const hay = `${item.label} ${item.subtitle ?? ''} ${item.keywords ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [props.actions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!props.open) return null;

  const grouped: Array<{ group: PaletteAction['group']; items: Array<{ action: PaletteAction; index: number }> }> = [];
  const order: PaletteAction['group'][] = ['commands', 'panels', 'entities'];
  for (const group of order) {
    const items = filtered
      .map((action, index) => ({ action, index }))
      .filter((entry) => entry.action.group === group);
    if (items.length > 0) grouped.push({ group, items });
  }

  const runAction = (action: PaletteAction | undefined) => {
    if (!action) return;
    props.onClose();
    action.run();
  };

  return (
    <div
      className="me-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('toolbar.commandPalette')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div className="me-palette">
        <div className="me-palette-input-row">
          <Search size={15} aria-hidden="true" />
          <input
            ref={inputRef}
            className="me-palette-input"
            value={query}
            placeholder={t('toolbar.commandPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                props.onClose();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (filtered.length > 0) setActiveIndex((prev) => (prev + 1) % filtered.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (filtered.length > 0) {
                  setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
                }
              } else if (event.key === 'Enter') {
                event.preventDefault();
                runAction(filtered[activeIndex]);
              }
            }}
          />
          <span className="me-kbd">Esc</span>
        </div>

        <div className="me-palette-list" role="listbox">
          {grouped.length === 0 ? (
            <div className="me-palette-group">{t('palette.empty')}</div>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group}>
                <div className="me-palette-group">
                  {group === 'commands'
                    ? t('palette.group.commands')
                    : group === 'panels'
                      ? t('palette.group.panels')
                      : t('palette.group.entities')}
                </div>
                {items.map(({ action, index }) => {
                  const Icon = group === 'commands'
                    ? Sparkles
                    : group === 'panels'
                      ? LayoutGrid
                      : Box;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`me-palette-item${index === activeIndex ? ' active' : ''}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runAction(action)}
                    >
                      <span className="me-palette-item-main">
                        <Icon size={13} aria-hidden="true" />
                        <span>{action.label}</span>
                      </span>
                      {action.subtitle && <span className="me-palette-sub">{action.subtitle}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="me-palette-footer">
          <Command size={11} style={{ verticalAlign: '-1px', marginRight: 6 }} aria-hidden="true" />
          {t('palette.hint')}
        </div>
      </div>
    </div>
  );
}
