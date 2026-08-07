export type RectLayoutDrive = {
  horizontal?: string;
  vertical?: string;
};

type LayoutEntity = {
  name?: string | null;
  components: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function rectLayoutDrive(
  entity: LayoutEntity,
  parent?: LayoutEntity | null,
): RectLayoutDrive {
  const drive: RectLayoutDrive = {};
  if (parent?.components.LayoutGroup) {
    const source = `${parent.name?.trim() || 'Parent'} Layout Group`;
    drive.horizontal = source;
    drive.vertical = source;
  }
  const fitter = record(entity.components.ContentSizeFitter);
  if (fitter) {
    if (String(fitter.horizontal_fit ?? fitter.horizontalFit ?? 'Unconstrained') !== 'Unconstrained') {
      drive.horizontal = 'Content Size Fitter';
    }
    if (String(fitter.vertical_fit ?? fitter.verticalFit ?? 'Unconstrained') !== 'Unconstrained') {
      drive.vertical = 'Content Size Fitter';
    }
  }
  const aspect = record(entity.components.AspectRatioFitter);
  const aspectMode = String(aspect?.aspect_mode ?? aspect?.aspectMode ?? 'None');
  if (aspectMode === 'HeightControlsWidth' || aspectMode === 'FitInParent' || aspectMode === 'EnvelopeParent') {
    drive.horizontal = 'Aspect Ratio Fitter';
  }
  if (aspectMode === 'WidthControlsHeight' || aspectMode === 'FitInParent' || aspectMode === 'EnvelopeParent') {
    drive.vertical = 'Aspect Ratio Fitter';
  }
  return drive;
}
