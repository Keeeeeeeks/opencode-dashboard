'use client';

import { useState } from 'react';
import { Tags } from 'lucide-react';
import type { TagSwitcherProps } from './types';

const NEW_TAG_VALUE = '__new_tag__';

export function TagSwitcher({ tags, activeTag, onChangeTag, onCreateTag }: TagSwitcherProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTag, setNewTag] = useState('');

  const handleCreate = () => {
    const normalized = newTag.trim();
    if (!normalized) {
      return;
    }
    onCreateTag(normalized);
    onChangeTag(normalized);
    setNewTag('');
    setIsCreating(false);
  };

  return (
    <div
      className="rounded-xl border p-3 space-y-3"
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div className="flex items-center gap-2">
        <Tags className="h-4 w-4" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
          Tags
        </h3>
      </div>

      <select
        value={activeTag}
        onChange={(event) => {
          if (event.target.value === NEW_TAG_VALUE) {
            setIsCreating(true);
            return;
          }
          onChangeTag(event.target.value);
        }}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
      >
        {tags.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
        <option value={NEW_TAG_VALUE}>+ New tag</option>
      </select>

      {isCreating && (
        <div className="space-y-2">
          <input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder="new-tag"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Add Tag
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewTag('');
              }}
              className="rounded-lg px-3 py-1.5 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
