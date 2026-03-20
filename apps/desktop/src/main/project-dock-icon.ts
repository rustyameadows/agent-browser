import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { nativeImage, type NativeImage } from 'electron';
import { DEFAULT_CHROME_COLOR } from '@agent-browser/protocol';

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

const ICON_SIZE = 512;
export const DEFAULT_DOCK_ICON_COLOR = '#000000';
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

export const resolveDefaultDockIconColor = (chromeColor: string): string =>
  chromeColor === DEFAULT_CHROME_COLOR ? DEFAULT_DOCK_ICON_COLOR : chromeColor;

const IMAGE_SIZE = 360;

const createSolidDockBitmap = (hexColor: string): Buffer => {
  const { red, green, blue } = parseHexColor(hexColor);
  const bitmap = Buffer.alloc(ICON_SIZE * ICON_SIZE * BYTES_PER_PIXEL);
  for (let index = 0; index < bitmap.length; index += BYTES_PER_PIXEL) {
    bitmap[index] = blue;
    bitmap[index + 1] = green;
    bitmap[index + 2] = red;
    bitmap[index + 3] = 0xff;
  }

  return bitmap;
};

const rasterizeSvgProjectIcon = async (projectIconPath: string): Promise<NativeImage> => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-browser-dock-icon-'));
  const thumbnailPath = path.join(outputDirectory, `${path.basename(projectIconPath)}.png`);

  try {
    await execFileAsync('qlmanage', ['-t', '-s', String(ICON_SIZE), '-o', outputDirectory, projectIconPath]);
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

const alphaBlendChannel = (source: number, destination: number, alpha: number): number =>
  Math.round(source * alpha + destination * (1 - alpha));

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
        ((options.destinationY + y) * ICON_SIZE + (options.destinationX + x)) * BYTES_PER_PIXEL;
      const sourceAlpha = sourceBitmap[sourceIndex + 3] / 255;
      if (sourceAlpha <= 0) {
        continue;
      }

      destinationBitmap[destinationIndex] = alphaBlendChannel(
        sourceBitmap[sourceIndex],
        destinationBitmap[destinationIndex],
        sourceAlpha,
      );
      destinationBitmap[destinationIndex + 1] = alphaBlendChannel(
        sourceBitmap[sourceIndex + 1],
        destinationBitmap[destinationIndex + 1],
        sourceAlpha,
      );
      destinationBitmap[destinationIndex + 2] = alphaBlendChannel(
        sourceBitmap[sourceIndex + 2],
        destinationBitmap[destinationIndex + 2],
        sourceAlpha,
      );
      destinationBitmap[destinationIndex + 3] = 0xff;
    }
  }
};

export const composeProjectDockIcon = async (options: {
  chromeColor: string;
  projectIconPath: string;
  templatePath: string;
}): Promise<NativeImage> => {
  void options.templatePath;
  const destinationBitmap = createSolidDockBitmap(options.chromeColor);
  const projectIconImage = await loadProjectIconImage(options.projectIconPath);
  const projectIconSize = projectIconImage.getSize();

  if (projectIconSize.width <= 0 || projectIconSize.height <= 0) {
    throw new Error(`Could not read project icon dimensions: ${options.projectIconPath}`);
  }

  const scale = Math.min(IMAGE_SIZE / projectIconSize.width, IMAGE_SIZE / projectIconSize.height);
  const targetWidth = Math.max(1, Math.round(projectIconSize.width * scale));
  const targetHeight = Math.max(1, Math.round(projectIconSize.height * scale));
  const resizedProjectIcon = projectIconImage.resize({
    width: targetWidth,
    height: targetHeight,
    quality: 'best',
  });

  compositeBitmap(destinationBitmap, resizedProjectIcon.toBitmap(), {
    sourceWidth: targetWidth,
    sourceHeight: targetHeight,
    destinationX: Math.max(0, Math.round((ICON_SIZE - targetWidth) / 2)),
    destinationY: Math.max(0, Math.round((ICON_SIZE - targetHeight) / 2)),
  });

  return nativeImage.createFromBitmap(destinationBitmap, {
    width: ICON_SIZE,
    height: ICON_SIZE,
  });
};

export const composeDefaultDockIcon = async (options: {
  chromeColor: string;
  templatePath: string;
}): Promise<NativeImage> => {
  void options.templatePath;
  return nativeImage.createFromBitmap(createSolidDockBitmap(resolveDefaultDockIconColor(options.chromeColor)), {
    width: ICON_SIZE,
    height: ICON_SIZE,
  });
};
