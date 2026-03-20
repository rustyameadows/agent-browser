import { DEFAULT_CHROME_COLOR } from '@agent-browser/protocol';

export const DOCK_ICON_CANVAS_SIZE = 512;
export const DOCK_ICON_TILE_SIZE = 432;
export const DOCK_ICON_TILE_INSET = 40;
export const DOCK_ICON_TILE_RADIUS = 104;
export const DOCK_ICON_ART_MAX_SIZE = 296;
export const DOCK_ICON_ART_MASK_RADIUS = 64;
export const DOCK_ICON_HIGHLIGHT_INSET = 6;
export const DOCK_ICON_HIGHLIGHT_WIDTH = 3;
export const DOCK_ICON_TOP_LIGHT_HEIGHT = 156;
export const DEFAULT_DOCK_ICON_COLOR = '#000000';

export type DockIconLayoutMetrics = {
  canvasSize: number;
  tileInset: number;
  tileSize: number;
  tileRadius: number;
  tileX: number;
  tileY: number;
  artMaxSize: number;
  artMaskRadius: number;
  highlightInset: number;
  highlightWidth: number;
  topLightHeight: number;
};

const scaleValue = (value: number, scale: number): number => Math.max(1, Math.round(value * scale));

export const getDockIconLayoutMetrics = (
  canvasSize = DOCK_ICON_CANVAS_SIZE,
): DockIconLayoutMetrics => {
  const scale = canvasSize / DOCK_ICON_CANVAS_SIZE;
  const tileSize = scaleValue(DOCK_ICON_TILE_SIZE, scale);
  const tileInset = Math.round((canvasSize - tileSize) / 2);

  return {
    canvasSize,
    tileInset,
    tileSize,
    tileRadius: scaleValue(DOCK_ICON_TILE_RADIUS, scale),
    tileX: tileInset,
    tileY: tileInset,
    artMaxSize: scaleValue(DOCK_ICON_ART_MAX_SIZE, scale),
    artMaskRadius: scaleValue(DOCK_ICON_ART_MASK_RADIUS, scale),
    highlightInset: scaleValue(DOCK_ICON_HIGHLIGHT_INSET, scale),
    highlightWidth: scaleValue(DOCK_ICON_HIGHLIGHT_WIDTH, scale),
    topLightHeight: scaleValue(DOCK_ICON_TOP_LIGHT_HEIGHT, scale),
  };
};

export const getDockIconArtMaskRadius = (maxDimension: number): number =>
  Math.max(1, Math.round(maxDimension * (DOCK_ICON_ART_MASK_RADIUS / DOCK_ICON_ART_MAX_SIZE)));

export const resolveDefaultDockIconColor = (chromeColor: string): string =>
  chromeColor === DEFAULT_CHROME_COLOR ? DEFAULT_DOCK_ICON_COLOR : chromeColor;
