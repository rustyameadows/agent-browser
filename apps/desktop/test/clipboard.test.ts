import { describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '../src/renderer/src/clipboard';

describe('copyTextToClipboard', () => {
  it('uses the browser Clipboard API when available', async () => {
    const writeText = vi.fn(async () => undefined);
    const bridgeCopy = vi.fn();

    const result = await copyTextToClipboard('hello world', {
      navigatorClipboard: { writeText },
      bridge: { copyText: bridgeCopy },
    });

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello world');
    expect(bridgeCopy).not.toHaveBeenCalled();
  });

  it('falls back to the Electron bridge when the browser Clipboard API rejects', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    const bridgeCopy = vi.fn();

    const result = await copyTextToClipboard('fallback value', {
      navigatorClipboard: { writeText },
      bridge: { copyText: bridgeCopy },
    });

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('fallback value');
    expect(bridgeCopy).toHaveBeenCalledWith('fallback value');
  });

  it('returns false when no copy implementation succeeds', async () => {
    const bridgeCopy = vi.fn(() => {
      throw new Error('clipboard unavailable');
    });

    const result = await copyTextToClipboard('still not copied', {
      navigatorClipboard: null,
      bridge: { copyText: bridgeCopy },
    });

    expect(result).toBe(false);
    expect(bridgeCopy).toHaveBeenCalledWith('still not copied');
  });
});
