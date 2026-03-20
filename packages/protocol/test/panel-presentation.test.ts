import { describe, expect, it } from 'vitest';
import {
  createDefaultPanelPresentationPreferences,
  isPanelPresentationPreference,
  isPanelPresentationPreferences,
  normalizePanelPresentationPreference,
} from '../src';

describe('panel presentation helpers', () => {
  it('creates right-sidebar defaults for every surface', () => {
    expect(createDefaultPanelPresentationPreferences()).toEqual({
      feedback: { mode: 'sidebar', side: 'right' },
      style: { mode: 'sidebar', side: 'right' },
      markdown: { mode: 'sidebar', side: 'right' },
      mcp: { mode: 'sidebar', side: 'right' },
      project: { mode: 'sidebar', side: 'right' },
    });
  });

  it('accepts valid preferences and normalizes sidebar defaults', () => {
    expect(isPanelPresentationPreference({ mode: 'floating-pill' })).toBe(true);
    expect(
      isPanelPresentationPreferences({
        feedback: { mode: 'sidebar', side: 'left' },
        style: { mode: 'floating-pill' },
        markdown: { mode: 'popout' },
        mcp: { mode: 'sidebar', side: 'right' },
        project: { mode: 'sidebar', side: 'right' },
      }),
    ).toBe(true);
    expect(normalizePanelPresentationPreference({ mode: 'sidebar' })).toEqual({
      mode: 'sidebar',
      side: 'right',
    });
  });

  it('rejects invalid preferences', () => {
    expect(isPanelPresentationPreference({ mode: 'sidebar', side: 'bottom' })).toBe(false);
    expect(
      isPanelPresentationPreferences({
        feedback: { mode: 'sidebar', side: 'right' },
      }),
    ).toBe(false);
  });
});
