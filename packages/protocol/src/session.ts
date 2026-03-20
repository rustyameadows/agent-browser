export const SESSION_COMMAND_CHANNEL = 'session:command';
export const SESSION_GET_STATE_CHANNEL = 'session:get-state';
export const SESSION_STATE_CHANNEL = 'session:state';

export const sessionRoles = ['launcher', 'project-session'] as const;
export const sessionStatuses = ['launching', 'ready', 'closing', 'closed', 'error'] as const;
export const sessionActions = ['refresh', 'openProject', 'focus', 'close'] as const;

export type SessionRole = (typeof sessionRoles)[number];
export type SessionStatus = (typeof sessionStatuses)[number];
export type SessionAction = (typeof sessionActions)[number];

export interface SessionSummary {
  sessionId: string;
  projectRoot: string;
  projectName: string;
  chromeColor: string;
  projectIconPath: string;
  isFocused: boolean;
  isHome: boolean;
  dockIconStatus: 'idle' | 'applied' | 'failed';
  status: SessionStatus;
}

export interface SessionViewState {
  role: SessionRole;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  lastError: string | null;
}

export type SessionCommand =
  | {
      action: 'refresh' | 'openProject';
      projectRoot?: string;
    }
  | {
      action: 'focus' | 'close';
      sessionId: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const createEmptySessionViewState = (): SessionViewState => ({
  role: 'launcher',
  sessions: [],
  currentSessionId: null,
  lastError: null,
});

export const isSessionSummary = (value: unknown): value is SessionSummary => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.sessionId === 'string' &&
    typeof value.projectRoot === 'string' &&
    typeof value.projectName === 'string' &&
    typeof value.chromeColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(value.chromeColor) &&
    typeof value.projectIconPath === 'string' &&
    typeof value.isFocused === 'boolean' &&
    typeof value.isHome === 'boolean' &&
    (value.dockIconStatus === 'idle' ||
      value.dockIconStatus === 'applied' ||
      value.dockIconStatus === 'failed') &&
    typeof value.status === 'string' &&
    sessionStatuses.includes(value.status as SessionStatus)
  );
};

export const isSessionViewState = (value: unknown): value is SessionViewState => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.role === 'string' &&
    sessionRoles.includes(value.role as SessionRole) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isSessionSummary) &&
    (typeof value.currentSessionId === 'string' || value.currentSessionId === null) &&
    (typeof value.lastError === 'string' || value.lastError === null)
  );
};

export const isSessionCommand = (value: unknown): value is SessionCommand => {
  if (!isRecord(value) || typeof value.action !== 'string') {
    return false;
  }

  if (!sessionActions.includes(value.action as SessionAction)) {
    return false;
  }

  switch (value.action) {
    case 'refresh':
      return !('sessionId' in value);
    case 'openProject':
      return (
        !('sessionId' in value) &&
        (!('projectRoot' in value) || typeof value.projectRoot === 'string')
      );
    case 'focus':
    case 'close':
      return typeof value.sessionId === 'string' && value.sessionId.trim().length > 0;
    default:
      return false;
  }
};
