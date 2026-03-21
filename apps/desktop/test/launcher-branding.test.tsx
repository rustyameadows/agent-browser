import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LauncherBrandIcon } from '../src/renderer/src/launcher-branding';
import { APP_IDENTITY_ICON_DATA_URL } from '../src/shared/app-identity-icon';

describe('LauncherBrandIcon', () => {
  it('renders the shared Loop Browser app identity icon asset', () => {
    const markup = renderToStaticMarkup(
      <LauncherBrandIcon className="launcherSurface__brandIcon" />,
    );

    expect(markup).toContain('class="launcherSurface__brandIcon"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(APP_IDENTITY_ICON_DATA_URL);
  });
});
