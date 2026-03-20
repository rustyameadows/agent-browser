import type {
  ChromeAppearanceCommand,
  ChromeAppearanceState,
  FeedbackCommand,
  FeedbackState,
  MarkdownViewState,
  NavigationCommand,
  NavigationState,
  PickerCommand,
  PickerState,
  ResizeWindowRequest,
  SessionSummary,
  ScreenshotRequest,
  WindowState,
} from '@agent-browser/protocol';
import type { BrowserScreenshotCapture } from './browser-shell';
import type { ToolServerRuntime, ToolTabSnapshot } from './tool-server';
import { SessionDirectoryController } from './session-manager';

const unreachable = (message: string): never => {
  throw new Error(message);
};

const fetchSessionJson = async (
  url: string,
  token: string,
  method: string,
  params: unknown,
): Promise<unknown> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-11-25',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
  });
  const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Session request failed (${response.status}).`);
  }

  return payload.result;
};

export class SessionBrokerRuntime implements ToolServerRuntime {
  constructor(private readonly sessions: SessionDirectoryController) {}

  private getSessionConnection(sessionId: string): { url: string; token: string } {
    const record = this.sessions.getSessionRecord(sessionId);
    if (!record) {
      throw new Error(`Could not find session ${sessionId}.`);
    }

    return {
      url: record.connection.url,
      token: record.connection.token,
    };
  }

  async proxyToolCall(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const connection = this.getSessionConnection(sessionId);
    return fetchSessionJson(connection.url, connection.token, 'tools/call', {
      name: toolName,
      arguments: Object.fromEntries(
        Object.entries(args).filter(([key]) => key !== 'sessionId'),
      ),
    });
  }

  async proxyResourceRead(sessionId: string, uri: string): Promise<unknown> {
    const connection = this.getSessionConnection(sessionId);
    return fetchSessionJson(connection.url, connection.token, 'resources/read', { uri });
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.sessions.listSessions();
  }

  async getCurrentSession(): Promise<SessionSummary | null> {
    return this.sessions.getCurrentSession();
  }

  async openSession(projectRoot?: string): Promise<SessionSummary[]> {
    await this.sessions.executeCommand({
      action: 'openProject',
      projectRoot,
    });
    return this.sessions.listSessions();
  }

  async focusSession(sessionId: string): Promise<SessionSummary | null> {
    await this.sessions.focusSession(sessionId);
    return this.sessions.getCurrentSession();
  }

  async closeSession(sessionId: string): Promise<SessionSummary[]> {
    await this.sessions.closeSession(sessionId);
    return this.sessions.listSessions();
  }

  listTabs(_sessionId?: string): ToolTabSnapshot[] {
    return unreachable('Session broker routes listTabs through proxyToolCall.');
  }

  executeNavigationCommand(
    _command: NavigationCommand,
    _sessionId?: string,
  ): Promise<NavigationState> {
    return Promise.reject(
      new Error('Session broker routes navigation through proxyToolCall.'),
    );
  }

  executePickerCommand(_command: PickerCommand, _sessionId?: string): Promise<PickerState> {
    return Promise.reject(new Error('Session broker routes picker through proxyToolCall.'));
  }

  getPickerState(_sessionId?: string): PickerState {
    return unreachable('Session broker routes picker state through proxyToolCall.');
  }

  executeChromeAppearanceCommand(
    _command: ChromeAppearanceCommand,
    _sessionId?: string,
  ): Promise<ChromeAppearanceState> {
    return Promise.reject(
      new Error('Session broker routes appearance commands through proxyToolCall.'),
    );
  }

  getChromeAppearanceState(_sessionId?: string): ChromeAppearanceState {
    return unreachable('Session broker routes appearance state through proxyToolCall.');
  }

  executeFeedbackCommand(_command: FeedbackCommand, _sessionId?: string): Promise<FeedbackState> {
    return Promise.reject(
      new Error('Session broker routes feedback commands through proxyToolCall.'),
    );
  }

  getFeedbackState(_sessionId?: string): FeedbackState {
    return unreachable('Session broker routes feedback state through proxyToolCall.');
  }

  getMarkdownForCurrentPage(
    _forceRefresh?: boolean,
    _sessionId?: string,
  ): Promise<MarkdownViewState> {
    return Promise.reject(
      new Error('Session broker routes markdown requests through proxyToolCall.'),
    );
  }

  getWindowState(_sessionId?: string): WindowState {
    return unreachable('Session broker routes window state through proxyToolCall.');
  }

  resizeWindow(
    _request: ResizeWindowRequest,
    _sessionId?: string,
  ): Promise<WindowState> {
    return Promise.reject(
      new Error('Session broker routes window resizing through proxyToolCall.'),
    );
  }

  captureScreenshot(
    _request: ScreenshotRequest,
    _sessionId?: string,
  ): Promise<BrowserScreenshotCapture> {
    return Promise.reject(
      new Error('Session broker routes screenshots through proxyToolCall.'),
    );
  }
}
