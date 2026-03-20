import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nativeImage } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn((command: string, args: string[], callback: (error: Error | null) => void) => {
    if (command === 'qlmanage') {
      const outputDirectory = args[args.indexOf('-o') + 1];
      const sourcePath = args[args.length - 1];
      fs.writeFileSync(
        path.join(outputDirectory, `${path.basename(sourcePath)}.png`),
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWUlEQVR4nO3PQQ0AIBDAMMC/58MCP7KkVbDX1pk5A6QNaA3QGqA1QGuA1gCtAVoDtAZoDdAaoDVAb+BkYGBgYGBgYGBgYGBgYGBgYGBgYGBgYJgBQ7UCP6xF9WAAAAAASUVORK5CYII=',
          'base64',
        ),
      );
    }

    callback(null);
  }),
}));

vi.mock('electron', () => {
  const createBitmap = (
    width: number,
    height: number,
    pattern: 'white-matte-circle' | 'transparent-circle' | 'opaque-square',
  ): Buffer => {
    const bitmap = Buffer.alloc(width * height * 4);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const insideCircle = (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2;

        if (pattern === 'white-matte-circle') {
          bitmap[index] = 0xff;
          bitmap[index + 1] = 0xff;
          bitmap[index + 2] = 0xff;
          bitmap[index + 3] = 0xff;
          if (insideCircle) {
            bitmap[index] = 0x00;
            bitmap[index + 1] = 0x00;
            bitmap[index + 2] = 0xff;
          }
          continue;
        }

        if (pattern === 'opaque-square') {
          bitmap[index] = 0x00;
          bitmap[index + 1] = 0x00;
          bitmap[index + 2] = 0xff;
          bitmap[index + 3] = 0xff;
          continue;
        }

        if (insideCircle) {
          bitmap[index] = 0x00;
          bitmap[index + 1] = 0x00;
          bitmap[index + 2] = 0xff;
          bitmap[index + 3] = 0xff;
        }
      }
    }

    return bitmap;
  };

  const createResizableImage = (pattern: 'white-matte-circle' | 'transparent-circle' | 'opaque-square') => ({
    isEmpty: () => false,
    getSize: () => ({ width: 256, height: 256 }),
    resize: ({ width, height }: { width: number; height: number }) => ({
      toBitmap: () => createBitmap(width, height, pattern),
    }),
  });

  const mockedNativeImage = {
    createFromBitmap: vi.fn(() => ({
      isEmpty: () => false,
    })),
    createFromBuffer: vi.fn(() => createResizableImage('white-matte-circle')),
    createFromDataURL: vi.fn(() => createResizableImage('white-matte-circle')),
    createFromPath: vi.fn((filePath: string) => {
      if (filePath.includes('opaque-square')) {
        return createResizableImage('opaque-square');
      }

      if (filePath.includes('transparent-circle')) {
        return createResizableImage('transparent-circle');
      }

      return createResizableImage('white-matte-circle');
    }),
  };

  return {
    nativeImage: mockedNativeImage,
  };
});

import {
  composeDefaultDockIcon,
  composeProjectDockIcon,
  DEFAULT_DOCK_ICON_COLOR,
  dockIconTemplatePath,
  resolveDefaultDockIconColor,
} from '../src/main/project-dock-icon';
import { getDockIconLayoutMetrics } from '../src/shared/dock-icon-style';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('project dock icon helpers', () => {
  const layout = getDockIconLayoutMetrics();
  const readPixel = (bitmap: Buffer, x: number, y: number): [number, number, number, number] => {
    const index = (y * 512 + x) * 4;
    return [bitmap[index], bitmap[index + 1], bitmap[index + 2], bitmap[index + 3]];
  };

  it('resolves the dock icon template in dev and packaged layouts', () => {
    expect(
      dockIconTemplatePath({
        appPath: '/tmp/loop-browser',
        isPackaged: false,
        resourcesPath: '/tmp/loop-browser/resources',
      }),
    ).toBe('/tmp/loop-browser/static/dock-icon-template.svg');

    expect(
      dockIconTemplatePath({
        appPath: '/tmp/loop-browser',
        isPackaged: true,
        resourcesPath: '/tmp/loop-browser/resources',
      }),
    ).toBe('/tmp/loop-browser/resources/static/dock-icon-template.svg');
  });

  it('composes a dock icon png from the project icon and template', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'loop-browser-dock-icon-'));
    tempDirs.push(tempDir);

    const projectIconPath = path.join(tempDir, 'project-icon.png');
    await writeFile(
      projectIconPath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWUlEQVR4nO3PQQ0AIBDAMMC/58MCP7KkVbDX1pk5A6QNaA3QGqA1QGuA1gCtAVoDtAZoDdAaoDVAb+BkYGBgYGBgYGBgYGBgYGBgYGBgYGBgYJgBQ7UCP6xF9WAAAAAASUVORK5CYII=',
        'base64',
      ),
    );

    const dockIcon = await composeProjectDockIcon({
      chromeColor: '#1144AA',
      projectIconPath,
      templatePath: path.resolve('apps/desktop/static/dock-icon-template.svg'),
    });

    expect(dockIcon.isEmpty()).toBe(false);
    expect(vi.mocked(nativeImage.createFromPath)).toHaveBeenCalledWith(projectIconPath);
    const [[bitmap]] = vi.mocked(nativeImage.createFromBitmap).mock.calls.slice(-1);
    expect(readPixel(bitmap, 0, 0)).toEqual([0x00, 0x00, 0x00, 0x00]);
    expect(readPixel(bitmap, 80, 300)).toEqual([0xaa, 0x44, 0x11, 0xff]);
    expect(readPixel(bitmap, 256, 256)).toEqual([0x00, 0x00, 0xff, 0xff]);
  });

  it('composes a dock icon from a simple svg project icon', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'loop-browser-dock-icon-'));
    tempDirs.push(tempDir);

    const projectIconPath = path.join(tempDir, 'project-icon.svg');
    await writeFile(
      projectIconPath,
      '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="red"/></svg>',
      'utf8',
    );

    const dockIcon = await composeProjectDockIcon({
      chromeColor: '#FF0ADE',
      projectIconPath,
      templatePath: path.resolve('apps/desktop/static/dock-icon-template.svg'),
    });

    expect(dockIcon.isEmpty()).toBe(false);
    expect(vi.mocked(nativeImage.createFromBuffer)).toHaveBeenCalled();
    const [[bitmap]] = vi.mocked(nativeImage.createFromBitmap).mock.calls.slice(-1);
    expect(readPixel(bitmap, 140, 360)).toEqual([0xde, 0x0a, 0xff, 0xff]);
    expect(readPixel(bitmap, 256, 256)).toEqual([0x00, 0x00, 0xff, 0xff]);
  });

  it('composes the default Loop Browser dock icon', async () => {
    const dockIcon = await composeDefaultDockIcon({
      chromeColor: '#1144AA',
      templatePath: path.resolve('apps/desktop/static/dock-icon-template.svg'),
    });

    expect(dockIcon.isEmpty()).toBe(false);
    const [[bitmap]] = vi.mocked(nativeImage.createFromBitmap).mock.calls.slice(-1);
    expect(readPixel(bitmap, 0, 0)).toEqual([0x00, 0x00, 0x00, 0x00]);
    expect(readPixel(bitmap, 256, 300)).toEqual([0xaa, 0x44, 0x11, 0xff]);
  });

  it('uses the black square only for the untouched default chrome color', async () => {
    const dockIcon = await composeDefaultDockIcon({
      chromeColor: '#FAFBFD',
      templatePath: path.resolve('apps/desktop/static/dock-icon-template.svg'),
    });

    expect(dockIcon.isEmpty()).toBe(false);
    const [[bitmap]] = vi.mocked(nativeImage.createFromBitmap).mock.calls.slice(-1);
    expect(readPixel(bitmap, 0, 0)).toEqual([0x00, 0x00, 0x00, 0x00]);
    expect(readPixel(bitmap, 256, 300)).toEqual([0x00, 0x00, 0x00, 0xff]);
  });

  it('preserves transparent circular artwork over the chrome tile', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'loop-browser-dock-icon-'));
    tempDirs.push(tempDir);

    const projectIconPath = path.join(tempDir, 'transparent-circle.png');
    await writeFile(projectIconPath, Buffer.from('transparent-circle'));

    await composeProjectDockIcon({
      chromeColor: '#55AA77',
      projectIconPath,
      templatePath: path.resolve('apps/desktop/static/dock-icon-template.svg'),
    });

    const [[bitmap]] = vi.mocked(nativeImage.createFromBitmap).mock.calls.slice(-1);
    expect(readPixel(bitmap, 140, 360)).toEqual([0x77, 0xaa, 0x55, 0xff]);
    expect(readPixel(bitmap, 256, 256)).toEqual([0x00, 0x00, 0xff, 0xff]);
  });

  it('clips opaque square artwork to a rounded inner mask', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'loop-browser-dock-icon-'));
    tempDirs.push(tempDir);

    const projectIconPath = path.join(tempDir, 'opaque-square.png');
    await writeFile(projectIconPath, Buffer.from('opaque-square'));

    await composeProjectDockIcon({
      chromeColor: '#223344',
      projectIconPath,
      templatePath: path.resolve('apps/desktop/static/dock-icon-template.svg'),
    });

    const [[bitmap]] = vi.mocked(nativeImage.createFromBitmap).mock.calls.slice(-1);
    const artInsetX = Math.round((512 - layout.artMaxSize) / 2);
    const artInsetY = Math.round((512 - layout.artMaxSize) / 2);
    expect(readPixel(bitmap, artInsetX + 8, artInsetY + layout.artMaxSize - 8)).toEqual([
      0x44,
      0x33,
      0x22,
      0xff,
    ]);
    expect(readPixel(bitmap, 256, 256)).toEqual([0x00, 0x00, 0xff, 0xff]);
  });

  it('uses the black fallback color only for the untouched default chrome color', () => {
    expect(resolveDefaultDockIconColor('#FAFBFD')).toBe(DEFAULT_DOCK_ICON_COLOR);
    expect(resolveDefaultDockIconColor('#F297E7')).toBe('#F297E7');
  });
});
