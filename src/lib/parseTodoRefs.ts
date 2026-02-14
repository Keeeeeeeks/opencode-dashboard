export type Segment =
  | { type: 'text'; value: string }
  | { type: 'ref'; todoId: string };

const TODO_REF_REGEX = /#todo_[a-zA-Z0-9_-]+/g;

export function parseTodoRefs(content: string): Segment[] {
  if (!content) return [];

  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(TODO_REF_REGEX)) {
    const matchStart = match.index;
    const matchText = match[0];

    if (matchStart > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, matchStart) });
    }

    segments.push({ type: 'ref', todoId: matchText.slice(1) });
    lastIndex = matchStart + matchText.length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
}
