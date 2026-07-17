import { createContext, useContext, type ReactNode } from 'react';

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
