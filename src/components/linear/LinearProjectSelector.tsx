'use client';

import type { LinearProject } from '@/lib/db/types';

interface LinearProjectSelectorProps {
  projects: LinearProject[];
  selectedProjectId: string | null;
  onSelect: (projectId: string | null) => void;
}

export function LinearProjectSelector({ projects, selectedProjectId, onSelect }: LinearProjectSelectorProps) {
  return (
    <select
      value={selectedProjectId ?? ''}
      onChange={(e) => onSelect(e.target.value || null)}
      className="rounded-md px-2.5 py-1.5 text-xs font-medium outline-none"
      style={{
        background: 'var(--bg-elevated)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
      }}
    >
      <option value="">All Linear Projects</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
