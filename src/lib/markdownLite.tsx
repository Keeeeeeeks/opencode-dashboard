import { Fragment, type ReactNode } from 'react';

type Token = string | ReactNode;

function applyPattern(
  tokens: Token[],
  pattern: RegExp,
  render: (content: string, key: string) => ReactNode,
  keyPrefix: string
): Token[] {
  const output: Token[] = [];

  tokens.forEach((token, tokenIndex) => {
    if (typeof token !== 'string') {
      output.push(token);
      return;
    }

    let lastIndex = 0;
    let matchIndex = 0;

    for (const match of token.matchAll(pattern)) {
      const start = match.index ?? 0;
      const full = match[0] ?? '';
      const content = match[1] ?? '';

      if (start > lastIndex) {
        output.push(token.slice(lastIndex, start));
      }

      output.push(render(content, `${keyPrefix}-${tokenIndex}-${matchIndex}`));
      lastIndex = start + full.length;
      matchIndex += 1;
    }

    if (lastIndex < token.length) {
      output.push(token.slice(lastIndex));
    }
  });

  return output;
}

export function renderMarkdownLite(text: string): ReactNode[] {
  if (!text) {
    return [];
  }

  let tokens: Token[] = [text];

  tokens = applyPattern(tokens, /`([^`]+)`/g, (content, key) => <code key={key}>{content}</code>, 'code');
  tokens = applyPattern(tokens, /\*\*([^*]+)\*\*/g, (content, key) => <strong key={key}>{content}</strong>, 'strong');
  tokens = applyPattern(tokens, /\*([^*]+)\*/g, (content, key) => <em key={key}>{content}</em>, 'em');

  return tokens.map((token, index) =>
    typeof token === 'string' ? <Fragment key={`text-${index}`}>{token}</Fragment> : token
  );
}
