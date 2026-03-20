import type { NavigationBridge } from '@agent-browser/protocol';

type ClipboardBridge = Pick<NavigationBridge, 'copyText'>;
type ClipboardApiLike = Pick<Clipboard, 'writeText'>;

type CopyTextDependencies = {
  navigatorClipboard?: ClipboardApiLike | null;
  bridge?: ClipboardBridge | null;
};

const getDefaultNavigatorClipboard = (): ClipboardApiLike | null => {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== 'function'
  ) {
    return null;
  }

  return navigator.clipboard;
};

const getDefaultClipboardBridge = (): ClipboardBridge | null => {
  if (typeof window === 'undefined' || typeof window.agentBrowser?.copyText !== 'function') {
    return null;
  }

  return window.agentBrowser;
};

export const copyTextToClipboard = async (
  value: string,
  dependencies: CopyTextDependencies = {},
): Promise<boolean> => {
  if (!value) {
    return false;
  }

  const navigatorClipboard =
    dependencies.navigatorClipboard === undefined
      ? getDefaultNavigatorClipboard()
      : dependencies.navigatorClipboard;

  if (navigatorClipboard) {
    try {
      await navigatorClipboard.writeText(value);
      return true;
    } catch {
      // Fall back to the Electron bridge if the browser Clipboard API is unavailable.
    }
  }

  const bridge =
    dependencies.bridge === undefined ? getDefaultClipboardBridge() : dependencies.bridge;
  if (!bridge) {
    return false;
  }

  try {
    const result = bridge.copyText(value) as unknown;
    if (
      result !== null &&
      typeof result === 'object' &&
      'then' in result &&
      typeof (result as PromiseLike<void>).then === 'function'
    ) {
      await (result as PromiseLike<void>);
    }

    return true;
  } catch {
    return false;
  }
};
