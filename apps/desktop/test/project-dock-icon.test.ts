import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nativeImage } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  nativeImage: {
    createFromBitmap: vi.fn(() => ({
      isEmpty: () => false,
    })),
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
      resize: () => ({
        toDataURL: () => 'data:image/png;base64,ZmFrZQ==',
      }),
    })),
  },
}));

import {
  composeDefaultDockIcon,
  composeProjectDockIcon,
  DEFAULT_DOCK_ICON_COLOR,
  dockIconTemplatePath,
  resolveDefaultDockIconColor,
} from '../src/main/project-dock-icon';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('project dock icon helpers', () => {
  const decodeSvgDataUrl = (dataUrl: string): string =>
    Buffer.from(dataUrl.replace(/^data:image\/svg\+xml;base64,/, ''), 'base64').toString('utf8');

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

    expect(dockIcon.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = decodeSvgDataUrl(dockIcon);
    expect(svg).toContain('#1144AA');
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).toContain('<image ');
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

    const svg = decodeSvgDataUrl(dockIcon);
    expect(svg).toContain('#FF0ADE');
    expect(svg).toContain('data:image/');
  });

  it('composes the default Loop Browser dock icon', async () => {
    const dockIcon = await composeDefaultDockIcon({
      chromeColor: '#1144AA',
      templatePath: path.resolve('apps/desktop/static/dock-icon-template.svg'),
    });

    expect(dockIcon.isEmpty()).toBe(false);
    const [[bitmap]] = vi.mocked(nativeImage.createFromBitmap).mock.calls.slice(-1);
    expect(bitmap[0]).toBe(0xaa);
    expect(bitmap[1]).toBe(0x44);
    expect(bitmap[2]).toBe(0x11);
    expect(bitmap[3]).toBe(0xff);
  });

  it('uses the black fallback color only for the untouched default chrome color', () => {
    expect(resolveDefaultDockIconColor('#FAFBFD')).toBe(DEFAULT_DOCK_ICON_COLOR);
    expect(resolveDefaultDockIconColor('#F297E7')).toBe('#F297E7');
  });
});
