import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { nativeImage, type NativeImage } from 'electron';
import { APP_IDENTITY_ICON_DATA_URL } from '../shared/app-identity-icon';
import {
  DOCK_ICON_CANVAS_SIZE,
  getDockIconArtMaskRadius,
  getDockIconLayoutMetrics,
  resolveDefaultDockIconColor,
} from '../shared/dock-icon-style';

export { DEFAULT_DOCK_ICON_COLOR, resolveDefaultDockIconColor } from '../shared/dock-icon-style';

export interface DockIconTemplateLocationOptions {
  appPath: string;
  isPackaged: boolean;
  resourcesPath: string;
}

export const dockIconTemplatePath = ({
  appPath,
  isPackaged,
  resourcesPath,
}: DockIconTemplateLocationOptions): string =>
  isPackaged
    ? path.join(resourcesPath, 'static', 'dock-icon-template.svg')
    : path.join(appPath, 'static', 'dock-icon-template.svg');
const BYTES_PER_PIXEL = 4;
const execFileAsync = promisify(execFile);

const toDataUrl = (mimeType: string, buffer: Buffer): string =>
  `data:${mimeType};base64,${buffer.toString('base64')}`;

const toSvgDataUrl = (svg: string): string =>
  toDataUrl('image/svg+xml', Buffer.from(svg, 'utf8'));

const parseHexColor = (hexColor: string): { red: number; green: number; blue: number } => ({
  red: Number.parseInt(hexColor.slice(1, 3), 16),
  green: Number.parseInt(hexColor.slice(3, 5), 16),
  blue: Number.parseInt(hexColor.slice(5, 7), 16),
});
const DOCK_ICON_LAYOUT = getDockIconLayoutMetrics();
const OPAQUE_ALPHA = 0xff;
const TILE_HIGHLIGHT_ALPHA = 44;
const TILE_TOP_LIGHT_ALPHA = 34;

const createTransparentDockBitmap = (): Buffer =>
  Buffer.alloc(DOCK_ICON_CANVAS_SIZE * DOCK_ICON_CANVAS_SIZE * BYTES_PER_PIXEL);

const createBgraColor = (
  hexColor: string,
  alpha = OPAQUE_ALPHA,
): { blue: number; green: number; red: number; alpha: number } => {
  const { red, green, blue } = parseHexColor(hexColor);
  return { blue, green, red, alpha };
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const bitmapIndex = (width: number, x: number, y: number): number =>
  (y * width + x) * BYTES_PER_PIXEL;

const blendChannel = (source: number, destination: number, sourceAlpha: number, destinationAlpha: number): number =>
  destinationAlpha === 0 && sourceAlpha === 0
    ? 0
    : Math.round(
        (source * sourceAlpha + destination * destinationAlpha * (1 - sourceAlpha)) /
          (sourceAlpha + destinationAlpha * (1 - sourceAlpha)),
      );

const blendPixel = (
  bitmap: Buffer,
  index: number,
  color: { blue: number; green: number; red: number; alpha: number },
): void => {
  const sourceAlpha = color.alpha / 255;
  if (sourceAlpha <= 0) {
    return;
  }

  const destinationAlpha = bitmap[index + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) {
    return;
  }

  bitmap[index] = blendChannel(color.blue, bitmap[index], sourceAlpha, destinationAlpha);
  bitmap[index + 1] = blendChannel(color.green, bitmap[index + 1], sourceAlpha, destinationAlpha);
  bitmap[index + 2] = blendChannel(color.red, bitmap[index + 2], sourceAlpha, destinationAlpha);
  bitmap[index + 3] = Math.round(outputAlpha * 255);
};

const isPointInsideRoundedRect = (
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number; radius: number },
): boolean => {
  const localX = x + 0.5 - rect.x;
  const localY = y + 0.5 - rect.y;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
    return false;
  }

  const safeRadius = clamp(rect.radius, 0, Math.min(rect.width, rect.height) / 2);
  const nearestX = clamp(localX, safeRadius, rect.width - safeRadius);
  const nearestY = clamp(localY, safeRadius, rect.height - safeRadius);
  const deltaX = localX - nearestX;
  const deltaY = localY - nearestY;

  return deltaX * deltaX + deltaY * deltaY <= safeRadius * safeRadius;
};

const fillRoundedRect = (
  bitmap: Buffer,
  color: { blue: number; green: number; red: number; alpha: number },
  rect: { x: number; y: number; width: number; height: number; radius: number },
): void => {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (!isPointInsideRoundedRect(x, y, rect)) {
        continue;
      }

      blendPixel(bitmap, bitmapIndex(DOCK_ICON_CANVAS_SIZE, x, y), color);
    }
  }
};

const fillRoundedRectRing = (
  bitmap: Buffer,
  color: { blue: number; green: number; red: number; alpha: number },
  rect: { x: number; y: number; width: number; height: number; radius: number },
  inset: number,
): void => {
  const innerRect = {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(1, rect.width - inset * 2),
    height: Math.max(1, rect.height - inset * 2),
    radius: Math.max(0, rect.radius - inset),
  };

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (!isPointInsideRoundedRect(x, y, rect) || isPointInsideRoundedRect(x, y, innerRect)) {
        continue;
      }

      blendPixel(bitmap, bitmapIndex(DOCK_ICON_CANVAS_SIZE, x, y), color);
    }
  }
};

const addTileTopLight = (
  bitmap: Buffer,
  rect: { x: number; y: number; width: number; height: number; radius: number },
): void => {
  const topLightHeight = Math.min(rect.height, DOCK_ICON_LAYOUT.topLightHeight);
  for (let y = rect.y; y < rect.y + topLightHeight; y += 1) {
    const relativeY = (y - rect.y) / Math.max(1, topLightHeight - 1);
    const alpha = Math.max(0, Math.round(TILE_TOP_LIGHT_ALPHA * (1 - relativeY) ** 1.35));
    if (alpha <= 0) {
      continue;
    }

    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (!isPointInsideRoundedRect(x, y, rect)) {
        continue;
      }

      blendPixel(bitmap, bitmapIndex(DOCK_ICON_CANVAS_SIZE, x, y), {
        blue: 0xff,
        green: 0xff,
        red: 0xff,
        alpha,
      });
    }
  }
};

const rasterizeSvgProjectIcon = async (projectIconPath: string): Promise<NativeImage> => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-browser-dock-icon-'));
  const thumbnailPath = path.join(outputDirectory, `${path.basename(projectIconPath)}.png`);

  try {
    await execFileAsync('qlmanage', ['-t', '-s', String(DOCK_ICON_CANVAS_SIZE), '-o', outputDirectory, projectIconPath]);
    const thumbnailBuffer = await fs.readFile(thumbnailPath);
    const thumbnail = nativeImage.createFromBuffer(thumbnailBuffer);
    if (thumbnail.isEmpty()) {
      throw new Error(`Quick Look produced an empty thumbnail for ${projectIconPath}`);
    }

    return thumbnail;
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
};

const loadProjectIconImage = async (projectIconPath: string): Promise<NativeImage> => {
  const extension = path.extname(projectIconPath).toLowerCase();
  const projectIcon =
    extension === '.svg' && process.platform === 'darwin'
      ? await rasterizeSvgProjectIcon(projectIconPath)
      : extension === '.svg'
        ? nativeImage.createFromDataURL(
            toDataUrl('image/svg+xml', Buffer.from(await fs.readFile(projectIconPath, 'utf8'), 'utf8')),
          )
        : nativeImage.createFromPath(projectIconPath);
  if (projectIcon.isEmpty()) {
    throw new Error(`Could not load project icon image: ${projectIconPath}`);
  }

  return projectIcon;
};

const colorDistance = (
  bitmap: Buffer,
  index: number,
  target: { blue: number; green: number; red: number; alpha: number },
): number =>
  Math.abs(bitmap[index] - target.blue) +
  Math.abs(bitmap[index + 1] - target.green) +
  Math.abs(bitmap[index + 2] - target.red) +
  Math.abs(bitmap[index + 3] - target.alpha);

const isLikelyMatteReference = (color: {
  blue: number;
  green: number;
  red: number;
  alpha: number;
}): boolean => {
  const channels = [color.red, color.green, color.blue];
  const brightest = Math.max(...channels);
  const darkest = Math.min(...channels);

  return color.alpha >= 245 && darkest >= 220 && brightest - darkest <= 18;
};

const stripEdgeMatte = (bitmap: Buffer, width: number, height: number): void => {
  const cornerIndexes = [
    0,
    (width - 1) * BYTES_PER_PIXEL,
    ((height - 1) * width) * BYTES_PER_PIXEL,
    ((height * width) - 1) * BYTES_PER_PIXEL,
  ];
  const reference = {
    blue: bitmap[cornerIndexes[0]],
    green: bitmap[cornerIndexes[0] + 1],
    red: bitmap[cornerIndexes[0] + 2],
    alpha: bitmap[cornerIndexes[0] + 3],
  };
  const tolerance = 24;

  if (
    !isLikelyMatteReference(reference) ||
    cornerIndexes.some((index) => colorDistance(bitmap, index, reference) > tolerance)
  ) {
    return;
  }

  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const offset = y * width + x;
    if (visited[offset] === 1) {
      return;
    }

    const index = offset * BYTES_PER_PIXEL;
    if (colorDistance(bitmap, index, reference) > tolerance) {
      return;
    }

    visited[offset] = 1;
    queue.push(offset);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length > 0) {
    const offset = queue.shift();
    if (offset === undefined) {
      break;
    }

    const index = offset * BYTES_PER_PIXEL;
    bitmap[index + 3] = 0;
    const x = offset % width;
    const y = Math.floor(offset / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }
};

const hasMeaningfulTransparency = (bitmap: Buffer, width: number, height: number): boolean => {
  const cornerCoordinates = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ] as const;

  if (
    cornerCoordinates.some(([x, y]) => {
      const index = bitmapIndex(width, x, y);
      return bitmap[index + 3] < 235;
    })
  ) {
    return true;
  }

  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 48));
  let sampleCount = 0;
  let transparentSamples = 0;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      sampleCount += 1;
      if (bitmap[bitmapIndex(width, x, y) + 3] < 235) {
        transparentSamples += 1;
      }
    }
  }

  return sampleCount > 0 && transparentSamples / sampleCount >= 0.03;
};

const clipBitmapToRoundedRect = (
  bitmap: Buffer,
  width: number,
  height: number,
  radius: number,
): void => {
  const rect = { x: 0, y: 0, width, height, radius };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isPointInsideRoundedRect(x, y, rect)) {
        continue;
      }

      bitmap[bitmapIndex(width, x, y) + 3] = 0;
    }
  }
};

const compositeBitmap = (
  destinationBitmap: Buffer,
  sourceBitmap: Buffer,
  options: {
    sourceWidth: number;
    sourceHeight: number;
    destinationX: number;
    destinationY: number;
  },
): void => {
  for (let y = 0; y < options.sourceHeight; y += 1) {
    for (let x = 0; x < options.sourceWidth; x += 1) {
      const sourceIndex = (y * options.sourceWidth + x) * BYTES_PER_PIXEL;
      const destinationIndex =
        ((options.destinationY + y) * DOCK_ICON_CANVAS_SIZE + (options.destinationX + x)) * BYTES_PER_PIXEL;
      const sourceAlpha = sourceBitmap[sourceIndex + 3];
      if (sourceAlpha <= 0) {
        continue;
      }

      blendPixel(destinationBitmap, destinationIndex, {
        blue: sourceBitmap[sourceIndex],
        green: sourceBitmap[sourceIndex + 1],
        red: sourceBitmap[sourceIndex + 2],
        alpha: sourceAlpha,
      });
    }
  }
};

const createBaseDockBitmap = (hexColor: string): Buffer => {
  const bitmap = createTransparentDockBitmap();
  const tileRect = {
    x: DOCK_ICON_LAYOUT.tileX,
    y: DOCK_ICON_LAYOUT.tileY,
    width: DOCK_ICON_LAYOUT.tileSize,
    height: DOCK_ICON_LAYOUT.tileSize,
    radius: DOCK_ICON_LAYOUT.tileRadius,
  };
  fillRoundedRect(bitmap, createBgraColor(hexColor), tileRect);
  addTileTopLight(bitmap, tileRect);
  fillRoundedRectRing(
    bitmap,
    createBgraColor('#FFFFFF', TILE_HIGHLIGHT_ALPHA),
    {
      x: tileRect.x + DOCK_ICON_LAYOUT.highlightInset,
      y: tileRect.y + DOCK_ICON_LAYOUT.highlightInset,
      width: tileRect.width - DOCK_ICON_LAYOUT.highlightInset * 2,
      height: tileRect.height - DOCK_ICON_LAYOUT.highlightInset * 2,
      radius: Math.max(0, tileRect.radius - DOCK_ICON_LAYOUT.highlightInset),
    },
    DOCK_ICON_LAYOUT.highlightWidth,
  );

  return bitmap;
};

export const composeProjectDockIcon = async (options: {
  chromeColor: string;
  projectIconPath: string;
  templatePath: string;
}): Promise<NativeImage> => {
  void options.templatePath;
  const destinationBitmap = createBaseDockBitmap(options.chromeColor);
  const projectIconImage = await loadProjectIconImage(options.projectIconPath);
  const projectIconSize = projectIconImage.getSize();

  if (projectIconSize.width <= 0 || projectIconSize.height <= 0) {
    throw new Error(`Could not read project icon dimensions: ${options.projectIconPath}`);
  }

  const scale = Math.min(
    DOCK_ICON_LAYOUT.artMaxSize / projectIconSize.width,
    DOCK_ICON_LAYOUT.artMaxSize / projectIconSize.height,
  );
  const targetWidth = Math.max(1, Math.round(projectIconSize.width * scale));
  const targetHeight = Math.max(1, Math.round(projectIconSize.height * scale));
  const resizedProjectIcon = projectIconImage.resize({
    width: targetWidth,
    height: targetHeight,
    quality: 'best',
  });
  const sourceBitmap = resizedProjectIcon.toBitmap();
  stripEdgeMatte(sourceBitmap, targetWidth, targetHeight);
  if (!hasMeaningfulTransparency(sourceBitmap, targetWidth, targetHeight)) {
    clipBitmapToRoundedRect(
      sourceBitmap,
      targetWidth,
      targetHeight,
      getDockIconArtMaskRadius(Math.max(targetWidth, targetHeight)),
    );
  }

  compositeBitmap(destinationBitmap, sourceBitmap, {
    sourceWidth: targetWidth,
    sourceHeight: targetHeight,
    destinationX: Math.max(0, Math.round((DOCK_ICON_CANVAS_SIZE - targetWidth) / 2)),
    destinationY: Math.max(0, Math.round((DOCK_ICON_CANVAS_SIZE - targetHeight) / 2)),
  });

  return nativeImage.createFromBitmap(destinationBitmap, {
    width: DOCK_ICON_CANVAS_SIZE,
    height: DOCK_ICON_CANVAS_SIZE,
  });
};

export const composeDefaultDockIcon = async (options: {
  chromeColor: string;
  templatePath: string;
}): Promise<NativeImage> => {
  void options.templatePath;
  return nativeImage.createFromBitmap(createBaseDockBitmap(resolveDefaultDockIconColor(options.chromeColor)), {
    width: DOCK_ICON_CANVAS_SIZE,
    height: DOCK_ICON_CANVAS_SIZE,
  });
};

export const composeAppIdentityDockIcon = (): NativeImage =>
  nativeImage.createFromDataURL(APP_IDENTITY_ICON_DATA_URL);
