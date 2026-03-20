import path from 'node:path';
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
const OUTER_INSET = 16;
const OUTER_RADIUS = 116;
const IMAGE_INSET = 76;
const IMAGE_SIZE = 360;
const IMAGE_RADIUS = 88;
export const DEFAULT_DOCK_ICON_COLOR = '#000000';
const BYTES_PER_PIXEL = 4;

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

const buildDockIconSvg = (chromeColor: string, projectImageDataUrl: string | null): string => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">
    <defs>
      <clipPath id="project-mask">
        <rect x="${IMAGE_INSET}" y="${IMAGE_INSET}" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" rx="${IMAGE_RADIUS}" />
      </clipPath>
    </defs>
    <rect x="${OUTER_INSET}" y="${OUTER_INSET}" width="${ICON_SIZE - OUTER_INSET * 2}" height="${ICON_SIZE - OUTER_INSET * 2}" rx="${OUTER_RADIUS}" fill="${chromeColor}" />
    ${
      projectImageDataUrl
        ? `<image href="${projectImageDataUrl}" x="${IMAGE_INSET}" y="${IMAGE_INSET}" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" preserveAspectRatio="xMidYMid slice" clip-path="url(#project-mask)" />`
        : ''
    }
  </svg>
`;

const loadProjectIconImage = (projectIconPath: string): NativeImage => {
  const projectIcon = nativeImage.createFromPath(projectIconPath);
  if (projectIcon.isEmpty()) {
    throw new Error(`Could not load project icon image: ${projectIconPath}`);
  }

  return projectIcon;
};

const readProjectImageDataUrl = async (projectIconPath: string): Promise<string> =>
  loadProjectIconImage(projectIconPath)
    .resize({
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      quality: 'best',
    })
    .toDataURL();

export const composeProjectDockIcon = async (options: {
  chromeColor: string;
  projectIconPath: string;
  templatePath: string;
}): Promise<string> =>
  toSvgDataUrl(
    buildDockIconSvg(options.chromeColor, await readProjectImageDataUrl(options.projectIconPath)),
  );

export const composeDefaultDockIcon = async (options: {
  chromeColor: string;
  templatePath: string;
}): Promise<NativeImage> => {
  void options.templatePath;
  const { red, green, blue } = parseHexColor(resolveDefaultDockIconColor(options.chromeColor));
  const bitmap = Buffer.alloc(ICON_SIZE * ICON_SIZE * BYTES_PER_PIXEL);
  for (let index = 0; index < bitmap.length; index += BYTES_PER_PIXEL) {
    bitmap[index] = blue;
    bitmap[index + 1] = green;
    bitmap[index + 2] = red;
    bitmap[index + 3] = 0xff;
  }

  return nativeImage.createFromBitmap(bitmap, {
    width: ICON_SIZE,
    height: ICON_SIZE,
  });
};
