import { describe, expect, it } from 'vitest';
import {
  isArtifactRecord,
  isPageScrollRequest,
  isResizeWindowRequest,
  isScreenshotArtifact,
  isScreenshotRequest,
  isWindowState,
} from '../src/index';

describe('tool protocol guards', () => {
  it('accepts valid screenshot requests', () => {
    expect(isScreenshotRequest({ target: 'page' })).toBe(true);
    expect(isScreenshotRequest({ target: 'page', fullPage: true })).toBe(true);
    expect(
      isScreenshotRequest({
        target: 'element',
        selector: '.card',
        format: 'jpeg',
        quality: 82,
        fileNameHint: 'fixture-card',
      }),
    ).toBe(true);
    expect(isPageScrollRequest({ selector: '.card' })).toBe(true);
    expect(isPageScrollRequest({ selector: '.card', block: 'center' })).toBe(true);
    expect(isPageScrollRequest({ byY: 480 })).toBe(true);
    expect(isPageScrollRequest({ byX: 24, byY: 480 })).toBe(true);
  });

  it('accepts valid screenshot artifacts and window state', () => {
    expect(
      isScreenshotArtifact({
        artifactId: 'artifact-1',
        mimeType: 'image/png',
        byteLength: 2048,
        pixelWidth: 1280,
        pixelHeight: 720,
        target: 'page',
        createdAt: '2026-03-14T00:00:00.000Z',
        fileName: 'artifact-1-page.png',
      }),
    ).toBe(true);

    expect(
      isArtifactRecord({
        artifactId: 'artifact-1',
        mimeType: 'image/png',
        byteLength: 2048,
        pixelWidth: 1280,
        pixelHeight: 720,
        target: 'page',
        createdAt: '2026-03-14T00:00:00.000Z',
        fileName: 'artifact-1-page.png',
        filePath: '/tmp/artifacts/artifact-1-page.png',
      }),
    ).toBe(true);

    expect(
      isWindowState({
        outerBounds: { x: 10, y: 10, width: 1400, height: 900 },
        contentBounds: { x: 10, y: 40, width: 1400, height: 860 },
        pageViewportBounds: { x: 0, y: 152, width: 1400, height: 708 },
        chromeHeight: 152,
        deviceScaleFactor: 2,
      }),
    ).toBe(true);
  });

  it('accepts valid resize requests and rejects malformed values', () => {
    expect(isResizeWindowRequest({ width: 1280, height: 720 })).toBe(true);
    expect(
      isResizeWindowRequest({ width: 1440, height: 900, target: 'pageViewport' }),
    ).toBe(true);
    expect(isScreenshotRequest({ target: 'full' })).toBe(false);
    expect(isScreenshotRequest({ target: 'element', fullPage: true })).toBe(false);
    expect(isPageScrollRequest({ selector: '.card', byY: 200 })).toBe(false);
    expect(isPageScrollRequest({ block: 'center' })).toBe(false);
    expect(isPageScrollRequest({ byY: '200' })).toBe(false);
    expect(isPageScrollRequest({})).toBe(false);
    expect(isResizeWindowRequest({ width: 'wide', height: 900 })).toBe(false);
    expect(
      isArtifactRecord({
        artifactId: 'artifact-1',
      }),
    ).toBe(false);
  });
});
