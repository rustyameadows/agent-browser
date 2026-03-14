import { JSDOM } from 'jsdom';
import { Defuddle } from 'defuddle/node';

export interface MarkdownSnapshotInput {
  html: string;
  url: string;
  fallbackTitle?: string;
}

export interface MarkdownDocument {
  url: string;
  title: string;
  markdown: string;
  author: string | null;
  site: string | null;
  wordCount: number | null;
}

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const extractMarkdownFromHtml = async (
  input: MarkdownSnapshotInput,
): Promise<MarkdownDocument> => {
  if (input.html.trim().length === 0) {
    throw new Error('Cannot generate Markdown from an empty page snapshot.');
  }

  const dom = new JSDOM(input.html, { url: input.url });
  const result = await Defuddle(dom.window.document, input.url, {
    markdown: true,
    separateMarkdown: true,
    useAsync: false,
  });

  const markdown = (result.contentMarkdown ?? result.content ?? '').trim();
  if (markdown.length === 0) {
    throw new Error('Defuddle returned empty Markdown content.');
  }

  return {
    url: input.url,
    title: result.title || input.fallbackTitle || '',
    markdown,
    author: normalizeNullableText(result.author),
    site: normalizeNullableText(result.site || result.domain),
    wordCount: typeof result.wordCount === 'number' ? result.wordCount : null,
  };
};
