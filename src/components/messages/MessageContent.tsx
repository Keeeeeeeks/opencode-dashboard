'use client';

import { parseTodoRefs } from '@/lib/parseTodoRefs';
import { TodoRefChip } from './TodoRefChip';

export function MessageContent({ content }: { content: string }) {
  const segments = parseTodoRefs(content);

  if (segments.length === 0) return null;

  if (segments.length === 1 && segments[0].type === 'text') {
    return <>{segments[0].value}</>;
  }

  return (
    <>
      {segments.map((segment, i) =>
        segment.type === 'text' ? (
          <span key={i}>{segment.value}</span>
        ) : (
          <TodoRefChip key={i} todoId={segment.todoId} />
        )
      )}
    </>
  );
}
