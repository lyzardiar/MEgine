import { useEffect, useRef } from 'react';

export function Console(props: { lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [props.lines]);

  return (
    <div className="console-body" ref={ref}>
      {props.lines.map((l, i) => {
        const cls = l.startsWith('[Warn]')
          ? 'console-line warn'
          : l.startsWith('[Error]')
            ? 'console-line error'
            : 'console-line';
        return (
          <div key={i} className={cls}>
            {l}
          </div>
        );
      })}
    </div>
  );
}
