import type { JSX } from 'react';
import { APP_IDENTITY_ICON_DATA_URL } from '../../shared/app-identity-icon';

export const LauncherBrandIcon = ({ className }: { className?: string }): JSX.Element => (
  <img alt="" aria-hidden="true" className={className} src={APP_IDENTITY_ICON_DATA_URL} />
);
