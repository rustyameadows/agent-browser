import { useEffect, useState, type FormEvent, type JSX, type SVGProps } from 'react';
import {
  createEmptyNavigationState,
  type NavigationCommand,
  type NavigationState,
} from '@agent-browser/protocol';

const emptyState = createEmptyNavigationState();
const stubTabs = ['Agent Chat', 'Inspector'];

type IconName =
  | 'arrowUpRight'
  | 'chevronLeft'
  | 'chevronRight'
  | 'file'
  | 'globe'
  | 'plus'
  | 'reload'
  | 'search'
  | 'sliders'
  | 'sparkles';

const getActiveTabLabel = (state: NavigationState): string => {
  if (state.title && state.title !== 'Agent Browser') {
    return state.title;
  }

  if (!state.url) {
    return 'Start Page';
  }

  try {
    const parsed = new URL(state.url);
    return parsed.protocol === 'file:' ? 'Start Page' : parsed.hostname.replace(/^www\./, '');
  } catch {
    return state.url;
  }
};

const getQuietStatus = (state: NavigationState): string => {
  if (!state.url) {
    return 'Single-tab preview | ready';
  }

  try {
    const parsed = new URL(state.url);
    const destination = parsed.protocol === 'file:' ? 'local fixture' : parsed.hostname.replace(/^www\./, '');
    return `Single-tab preview | ${destination}`;
  } catch {
    return 'Single-tab preview';
  }
};

const getLocationIcon = (url: string): IconName => (url.startsWith('file:') ? 'file' : 'globe');

const ChromeIcon = ({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }): JSX.Element => {
  switch (name) {
    case 'chevronLeft':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <path d="M11.75 4.75 6.5 10l5.25 5.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case 'chevronRight':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <path d="M8.25 4.75 13.5 10l-5.25 5.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case 'reload':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <path
            d="M14.25 7.25A4.75 4.75 0 1 0 15 12m-.75-4.75V4.5m0 2.75H11.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      );
    case 'plus':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <path d="M10 4.5v11m-5.5-5.5h11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case 'search':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <circle cx="8.75" cy="8.75" r="4.75" stroke="currentColor" strokeWidth="1.7" />
          <path d="m12.5 12.5 3 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <path
            d="m10 3 1.3 3.7L15 8l-3.7 1.3L10 13l-1.3-3.7L5 8l3.7-1.3L10 3Zm5 9.5.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7ZM4.5 11l.8 2.1 2.2.8-2.2.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'sliders':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <path d="M4 5.5h12M4 10h12M4 14.5h12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
          <circle cx="7" cy="5.5" fill="currentColor" r="1.4" />
          <circle cx="12.5" cy="10" fill="currentColor" r="1.4" />
          <circle cx="9.5" cy="14.5" fill="currentColor" r="1.4" />
        </svg>
      );
    case 'file':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <path
            d="M6.25 3.5h5.5l3 3v10H6.25a1.25 1.25 0 0 1-1.25-1.25v-10A1.25 1.25 0 0 1 6.25 3.5Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path d="M11.75 3.5v3h3" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case 'arrowUpRight':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <path d="M6.5 13.5 13.5 6.5m-5 .5h5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case 'globe':
      return (
        <svg fill="none" viewBox="0 0 20 20" {...props}>
          <circle cx="10" cy="10" r="6.25" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4.5 10h11M10 3.75c1.8 1.75 2.7 3.83 2.7 6.25S11.8 14.5 10 16.25M10 3.75c-1.8 1.75-2.7 3.83-2.7 6.25S8.2 14.5 10 16.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
        </svg>
      );
  }
};

export const App = (): JSX.Element => {
  const [navigationState, setNavigationState] = useState<NavigationState>(emptyState);
  const [draftUrl, setDraftUrl] = useState('');
  const [isEditingAddress, setIsEditingAddress] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const syncInitialState = async (): Promise<void> => {
      const initialState = await window.agentBrowser.getState();
      if (!isMounted) {
        return;
      }

      setNavigationState(initialState);
      setDraftUrl(initialState.url);
    };

    void syncInitialState();

    const unsubscribe = window.agentBrowser.subscribe((nextState) => {
      if (!isMounted) {
        return;
      }

      setNavigationState(nextState);
      if (!isEditingAddress) {
        setDraftUrl(nextState.url);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isEditingAddress]);

  const runCommand = async (command: NavigationCommand): Promise<void> => {
    const nextState = await window.agentBrowser.execute(command);
    setNavigationState(nextState);

    if (command.action === 'navigate') {
      setDraftUrl(nextState.url);
      setIsEditingAddress(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await runCommand({ action: 'navigate', target: draftUrl });
  };

  const activeTabLabel = getActiveTabLabel(navigationState);
  const diagnosticLabel = navigationState.lastError ?? getQuietStatus(navigationState);
  const locationIcon = getLocationIcon(navigationState.url);

  return (
    <main className="shell">
      <section className="shell__panel">
        <div className="shell__tabstrip">
          <div className="shell__tabRail">
            <div aria-hidden="true" className="shell__newTab">
              <ChromeIcon className="shell__icon" name="plus" />
            </div>

            <div className={`shell__tab shell__tab--active${navigationState.isLoading ? ' shell__tab--loading' : ''}`}>
              <span className={`shell__tabIndicator${navigationState.isLoading ? ' shell__tabIndicator--loading' : ''}`} />
              <span className="shell__tabTitle">{activeTabLabel}</span>
            </div>

            {stubTabs.map((label) => (
              <div aria-hidden="true" className="shell__tab shell__tab--stub" key={label}>
                <span className="shell__tabIndicator shell__tabIndicator--stub" />
                <span className="shell__tabTitle">{label}</span>
              </div>
            ))}
          </div>

          <div className="shell__utilityRail">
            <div aria-hidden="true" className="shell__utility shell__utility--icon">
              <ChromeIcon className="shell__icon" name="search" />
            </div>
            <div aria-hidden="true" className="shell__utility shell__utility--icon">
              <ChromeIcon className="shell__icon" name="sparkles" />
            </div>
            <div aria-hidden="true" className="shell__utility shell__utility--pill">
              Ask Agent
            </div>
            <div aria-hidden="true" className="shell__profileStub">
              AB
            </div>
          </div>
        </div>

        <form className="shell__toolbar" onSubmit={(event) => void handleSubmit(event)}>
          <div className="shell__nav">
            <button
              aria-label="Go back"
              className="shell__navButton"
              disabled={!navigationState.canGoBack}
              onClick={() => void runCommand({ action: 'back' })}
              type="button"
            >
              <ChromeIcon className="shell__icon" name="chevronLeft" />
            </button>
            <button
              aria-label="Go forward"
              className="shell__navButton"
              disabled={!navigationState.canGoForward}
              onClick={() => void runCommand({ action: 'forward' })}
              type="button"
            >
              <ChromeIcon className="shell__icon" name="chevronRight" />
            </button>
            <button
              aria-label={navigationState.isLoading ? 'Stop loading' : 'Reload page'}
              className="shell__navButton"
              onClick={() =>
                void runCommand({ action: navigationState.isLoading ? 'stop' : 'reload' })
              }
              type="button"
            >
              <ChromeIcon className="shell__icon" name="reload" />
            </button>
          </div>

          <label className="shell__omnibox">
            <span className="shell__srOnly">Address</span>
            <span className="shell__omniboxFrame">
              <span aria-hidden="true" className="shell__omniboxIcon">
                <ChromeIcon className="shell__icon shell__icon--muted" name={locationIcon} />
              </span>
              <input
                autoCapitalize="off"
                autoCorrect="off"
                className={`shell__omniboxInput${isEditingAddress ? ' shell__omniboxInput--editing' : ''}`}
                onBlur={() => setIsEditingAddress(false)}
                onChange={(event) => setDraftUrl(event.target.value)}
                onFocus={() => setIsEditingAddress(true)}
                placeholder="Search or enter website name"
                spellCheck={false}
                type="text"
                value={draftUrl}
              />
            </span>
          </label>

          <div className="shell__toolbarEdge">
            <div aria-hidden="true" className="shell__toolbarStub">
              <ChromeIcon className="shell__icon shell__icon--muted" name="sliders" />
            </div>
            <button aria-label="Load address" className="shell__goButton" type="submit">
              <ChromeIcon className="shell__icon" name="arrowUpRight" />
            </button>
          </div>
        </form>

        <div className={`shell__diagnostic${navigationState.lastError ? ' shell__diagnostic--error' : ''}`}>
          {diagnosticLabel}
        </div>
      </section>
    </main>
  );
};
