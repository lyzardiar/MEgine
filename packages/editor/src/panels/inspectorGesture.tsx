import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type FocusEvent,
  type ReactNode,
} from 'react';

type InspectorGesture = {
  begin: () => void;
  end: () => void;
};

const NOOP_GESTURE: InspectorGesture = { begin: () => {}, end: () => {} };
const InspectorGestureContext = createContext<InspectorGesture>(NOOP_GESTURE);

export function InspectorGestureProvider(props: InspectorGesture & { children: ReactNode }) {
  return (
    <InspectorGestureContext.Provider value={{ begin: props.begin, end: props.end }}>
      {props.children}
    </InspectorGestureContext.Provider>
  );
}

export function useInspectorGesture(): InspectorGesture {
  return useContext(InspectorGestureContext);
}

function isInspectorEditControl(target: EventTarget): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
}

export function InspectorEditScope(props: { children: ReactNode }) {
  const gesture = useInspectorGesture();
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;
  const editing = useRef(false);

  useEffect(() => () => {
    if (!editing.current) return;
    editing.current = false;
    gestureRef.current.end();
  }, []);

  const begin = (event: FocusEvent<HTMLDivElement>) => {
    if (editing.current || !isInspectorEditControl(event.target)) return;
    editing.current = true;
    gestureRef.current.begin();
  };
  const end = (event: FocusEvent<HTMLDivElement>) => {
    if (!editing.current || !isInspectorEditControl(event.target)) return;
    editing.current = false;
    gestureRef.current.end();
  };

  return (
    <div className="dock-body" onFocusCapture={begin} onBlurCapture={end}>
      {props.children}
    </div>
  );
}
