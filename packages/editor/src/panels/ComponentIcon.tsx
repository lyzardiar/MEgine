import { AudioLines, Box, Camera, ChevronRight, Code, Grid2X2, Image, Layers, Lightbulb, Move, PanelTop, Scan, Shapes, Sparkles, Type, type LucideIcon } from 'lucide-react';

const icons: Array<[RegExp, LucideIcon]> = [
  [/rect.*transform/i, Scan], [/transform/i, Move], [/camera/i, Camera],
  [/light/i, Lightbulb], [/audio/i, AudioLines], [/effekseer|particle/i, Sparkles],
  [/sprite|image|texture/i, Image], [/text|font/i, Type], [/canvas|panel/i, PanelTop],
  [/layout|grid/i, Grid2X2], [/mesh|collider|rigidbody/i, Box], [/material|render/i, Layers],
  [/button|toggle|select/i, ChevronRight], [/script|behaviour/i, Code],
];

/** Component headers and references share the editor's vector icon family. */
export function ComponentIcon({ name }: { name: string }) {
  const Icon = icons.find(([pattern]) => pattern.test(name))?.[1] ?? Shapes;
  return <Icon size={15} strokeWidth={1.6} aria-hidden="true" />;
}
