import { describe, expect, it } from 'vitest';
import {
  createEmptySessionViewState,
  isSessionCommand,
  isSessionSummary,
  isSessionViewState,
} from '../src/index';

describe('session protocol guards', () => {
  it('accepts valid session summaries and view state', () => {
    expect(
      isSessionSummary({
        sessionId: 'client-a-1234abcd',
        projectRoot: '/tmp/client-a',
        projectName: 'client-a',
        chromeColor: '#F297E7',
        projectIconPath: './icon.svg',
        isFocused: true,
        isHome: false,
        dockIconStatus: 'applied',
        status: 'ready',
      }),
    ).toBe(true);

    expect(
      isSessionViewState({
        role: 'launcher',
        sessions: [
          {
            sessionId: 'client-a-1234abcd',
            projectRoot: '/tmp/client-a',
            projectName: 'client-a',
            chromeColor: '#F297E7',
            projectIconPath: './icon.svg',
            isFocused: true,
            isHome: false,
            dockIconStatus: 'applied',
            status: 'ready',
          },
        ],
        currentSessionId: 'client-a-1234abcd',
        lastError: null,
      }),
    ).toBe(true);
  });

  it('accepts valid session commands and rejects malformed payloads', () => {
    expect(isSessionCommand({ action: 'refresh' })).toBe(true);
    expect(isSessionCommand({ action: 'openProject' })).toBe(true);
    expect(isSessionCommand({ action: 'openProject', projectRoot: '/tmp/client-a' })).toBe(true);
    expect(isSessionCommand({ action: 'focus', sessionId: 'client-a-1234abcd' })).toBe(true);
    expect(isSessionCommand({ action: 'close', sessionId: 'client-a-1234abcd' })).toBe(true);

    expect(isSessionCommand({ action: 'focus' })).toBe(false);
    expect(isSessionCommand({ action: 'openProject', sessionId: 'oops' })).toBe(false);
    expect(isSessionCommand({ action: 'switch', sessionId: 'client-a-1234abcd' })).toBe(false);
  });

  it('creates an empty launcher session view state', () => {
    expect(createEmptySessionViewState()).toEqual({
      role: 'launcher',
      sessions: [],
      currentSessionId: null,
      lastError: null,
    });
  });
});
