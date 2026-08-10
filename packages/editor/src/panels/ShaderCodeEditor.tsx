import { useMemo, useRef, useState } from 'react';
import {
  highlightShaderSource,
  shaderCompletions,
  type ShaderCompletion,
  type ShaderCompletionResult,
} from '../shaderLanguage.ts';

type CompletionState = ShaderCompletionResult & { selected: number };

function cursorLineColumn(source: string, cursor: number): { line: number; column: number } {
  const prefix = source.slice(0, cursor);
  const lines = prefix.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

export function ShaderCodeEditor(props: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSave: () => void;
  onScroll?: (top: number) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [cursor, setCursor] = useState(0);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const tokens = useMemo(() => highlightShaderSource(props.value), [props.value]);
  const position = cursorLineColumn(props.value, cursor);

  const openCompletion = (value: string, selection: number, force = false) => {
    const result = shaderCompletions(value, selection, force);
    setCursor(selection);
    setCompletion(result.items.length > 0 ? { ...result, selected: 0 } : null);
  };

  const setSelectionAfterRender = (selection: number) => {
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(selection, selection);
      setCursor(selection);
    });
  };

  const acceptCompletion = (item: ShaderCompletion) => {
    if (!completion) return;
    const next = `${props.value.slice(0, completion.start)}${item.insertText}${props.value.slice(completion.end)}`;
    const nextCursor = completion.start + item.insertText.length + (item.cursorOffset ?? 0);
    props.onChange(next);
    setCompletion(null);
    setSelectionAfterRender(nextCursor);
  };

  const popupLeft = Math.max(8, Math.min(
    (textarea.current?.clientWidth ?? 460) - 300,
    12 + (position.column - 1) * 7.25 - scroll.left,
  ));
  const popupTop = Math.max(4, 9 + position.line * 18.6 - scroll.top);

  return (
    <div className="shader-code-editor">
      <pre
        className="shader-code-highlight"
        aria-hidden="true"
        style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
      >
        {tokens.map((token, index) => (
          <span className={`shader-token-${token.kind}`} key={`${index}-${token.kind}`}>{token.text}</span>
        ))}
      </pre>
      <textarea
        ref={textarea}
        aria-label="Surface Shader source"
        value={props.value}
        disabled={props.disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onFocus={props.onFocus}
        onBlur={() => {
          setCompletion(null);
          props.onBlur();
        }}
        onChange={(event) => {
          const selection = event.currentTarget.selectionStart;
          const value = event.currentTarget.value;
          props.onChange(value);
          openCompletion(value, selection);
        }}
        onClick={(event) => {
          setCursor(event.currentTarget.selectionStart);
          setCompletion(null);
        }}
        onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
        onScroll={(event) => {
          setScroll({
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          });
          props.onScroll?.(event.currentTarget.scrollTop);
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === ' ') {
            event.preventDefault();
            openCompletion(props.value, event.currentTarget.selectionStart, true);
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            props.onSave();
            return;
          }
          if (completion && event.key === 'ArrowDown') {
            event.preventDefault();
            setCompletion({
              ...completion,
              selected: (completion.selected + 1) % completion.items.length,
            });
            return;
          }
          if (completion && event.key === 'ArrowUp') {
            event.preventDefault();
            setCompletion({
              ...completion,
              selected: (completion.selected - 1 + completion.items.length) % completion.items.length,
            });
            return;
          }
          if (completion && (event.key === 'Enter' || event.key === 'Tab')) {
            event.preventDefault();
            acceptCompletion(completion.items[completion.selected]);
            return;
          }
          if (completion && event.key === 'Escape') {
            event.preventDefault();
            setCompletion(null);
            return;
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            const start = event.currentTarget.selectionStart;
            const end = event.currentTarget.selectionEnd;
            const next = `${props.value.slice(0, start)}    ${props.value.slice(end)}`;
            props.onChange(next);
            setSelectionAfterRender(start + 4);
          }
        }}
      />
      {completion && (
        <div
          className="shader-completion-list"
          role="listbox"
          aria-label="Shader completions"
          style={{ left: popupLeft, top: popupTop }}
        >
          {completion.items.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === completion.selected}
              className={index === completion.selected ? 'selected' : ''}
              key={`${item.kind}-${item.label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => acceptCompletion(item)}
            >
              <i>{item.kind.slice(0, 1).toUpperCase()}</i>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </button>
          ))}
        </div>
      )}
      <div className="shader-code-status" aria-live="polite">
        <span>Ln {position.line}, Col {position.column}</span>
        <span>WGSL</span>
        <span>Ctrl+Space: Complete</span>
      </div>
    </div>
  );
}
