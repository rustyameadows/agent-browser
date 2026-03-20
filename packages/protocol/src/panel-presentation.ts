export const panelSurfaceIds = ['feedback', 'style', 'markdown', 'mcp', 'project'] as const;
export const panelPresentationModes = ['sidebar', 'floating-pill', 'popout'] as const;
export const panelSidebarSides = ['left', 'right'] as const;

export type PanelSurfaceId = (typeof panelSurfaceIds)[number];
export type PanelPresentationMode = (typeof panelPresentationModes)[number];
export type PanelSidebarSide = (typeof panelSidebarSides)[number];

export interface PanelPresentationPreference {
  mode: PanelPresentationMode;
  side?: PanelSidebarSide;
}

export type PanelPresentationPreferences = Record<PanelSurfaceId, PanelPresentationPreference>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const createDefaultPanelPresentationPreference = (): PanelPresentationPreference => ({
  mode: 'sidebar',
  side: 'right',
});

export const createDefaultPanelPresentationPreferences = (): PanelPresentationPreferences => ({
  feedback: createDefaultPanelPresentationPreference(),
  style: createDefaultPanelPresentationPreference(),
  markdown: createDefaultPanelPresentationPreference(),
  mcp: createDefaultPanelPresentationPreference(),
  project: createDefaultPanelPresentationPreference(),
});

export const isPanelSurfaceId = (value: unknown): value is PanelSurfaceId =>
  typeof value === 'string' && panelSurfaceIds.includes(value as PanelSurfaceId);

export const isPanelPresentationMode = (value: unknown): value is PanelPresentationMode =>
  typeof value === 'string' && panelPresentationModes.includes(value as PanelPresentationMode);

export const isPanelSidebarSide = (value: unknown): value is PanelSidebarSide =>
  typeof value === 'string' && panelSidebarSides.includes(value as PanelSidebarSide);

export const isPanelPresentationPreference = (
  value: unknown,
): value is PanelPresentationPreference => {
  if (!isRecord(value) || !isPanelPresentationMode(value.mode)) {
    return false;
  }

  if (value.mode === 'sidebar') {
    return !('side' in value) || value.side === undefined || isPanelSidebarSide(value.side);
  }

  return !('side' in value) || value.side === undefined;
};

export const isPanelPresentationPreferences = (
  value: unknown,
): value is PanelPresentationPreferences => {
  if (!isRecord(value)) {
    return false;
  }

  return panelSurfaceIds.every((surfaceId) => isPanelPresentationPreference(value[surfaceId]));
};

export const normalizePanelPresentationPreference = (
  value: PanelPresentationPreference | undefined,
): PanelPresentationPreference => {
  if (!value || value.mode === 'sidebar') {
    return {
      mode: 'sidebar',
      side: value?.side === 'left' ? 'left' : 'right',
    };
  }

  return {
    mode: value.mode,
  };
};

export const mergePanelPresentationPreferences = (
  current: PanelPresentationPreferences,
  update: Partial<PanelPresentationPreferences> | undefined,
): PanelPresentationPreferences => {
  if (!update) {
    return {
      ...current,
    };
  }

  return {
    feedback: normalizePanelPresentationPreference(update.feedback ?? current.feedback),
    style: normalizePanelPresentationPreference(update.style ?? current.style),
    markdown: normalizePanelPresentationPreference(update.markdown ?? current.markdown),
    mcp: normalizePanelPresentationPreference(update.mcp ?? current.mcp),
    project: normalizePanelPresentationPreference(update.project ?? current.project),
  };
};
