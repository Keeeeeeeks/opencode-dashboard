'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useV2TasksStore } from '@/stores/v2Tasks';
import type { Task, Subtask } from '@/lib/db/types';

interface V2TaskItem extends Task {
  original_id?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const POLL_INTERVAL = 5000;
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }
  return headers;
}

interface CreateTaskData {
  title: string;
  description?: string | null;
  status?: Task['status'];
  priority?: Task['priority'];
  dependencies?: string | number[] | null;
  details?: string | null;
  test_strategy?: string | null;
  tag?: string;
}

interface UpdateTaskData extends Partial<CreateTaskData> {
  complexity_score?: number | null;
  assigned_agent_id?: string | null;
  linear_issue_id?: string | null;
}

interface CreateSubtaskData {
  title: string;
  description?: string | null;
  status?: Subtask['status'];
  dependencies?: string | number[] | null;
  details?: string | null;
}

interface UpdateSubtaskData extends Partial<CreateSubtaskData> {}

export function useV2Tasks() {
  const {
    setTasks,
    setSubtasks,
    setTags,
    setNextTask,
    setIsLoading,
    activeTag,
    tasks,
  } = useV2TasksStore();
  const isPollingRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTasks = useCallback(
    async (tag: string) => {
      const params = new URLSearchParams({ tag });
      const res = await fetch(`${API_BASE}/api/v2/tasks?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const data = (await res.json()) as { tasks: V2TaskItem[] };
      setTasks(data.tasks || []);
      return data.tasks || [];
    },
    [setTasks]
  );

  const fetchNextTask = useCallback(
    async (tag: string) => {
      const params = new URLSearchParams({ tag });
      const res = await fetch(`${API_BASE}/api/v2/tasks/next?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch next task');
      }
      const data = (await res.json()) as { task: V2TaskItem | null };
      setNextTask(data.task ?? null);
      return data.task ?? null;
    },
    [setNextTask]
  );

  const fetchTags = useCallback(async () => {
    const currentTags = new Set<string>(['master', activeTag]);
    for (const task of tasks) {
      if (task.tag.trim()) {
        currentTags.add(task.tag);
      }
    }
    const nextTags = Array.from(currentTags).sort();
    setTags(nextTags);
    return nextTags;
  }, [activeTag, tasks, setTags]);

  const fetchSubtasks = useCallback(
    async (taskId: number) => {
      const res = await fetch(`${API_BASE}/api/v2/tasks/${taskId}/subtasks`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch subtasks');
      }
      const data = (await res.json()) as { subtasks: Subtask[] };
      const subtasksForTask = data.subtasks || [];
      setSubtasks(taskId, subtasksForTask);
      return subtasksForTask;
    },
    [setSubtasks]
  );

  const createTask = useCallback(
    async (taskData: CreateTaskData) => {
      const res = await fetch(`${API_BASE}/api/v2/tasks`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(taskData),
      });
      if (!res.ok) {
        throw new Error('Failed to create task');
      }
      const data = (await res.json()) as { task: V2TaskItem };
      await fetchTasks(taskData.tag || activeTag);
      await fetchNextTask(taskData.tag || activeTag);
      return data.task;
    },
    [activeTag, fetchNextTask, fetchTasks]
  );

  const updateTask = useCallback(
    async (id: number, updates: UpdateTaskData & { original_id?: string }) => {
      const res = await fetch(`${API_BASE}/api/v2/tasks`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) {
        throw new Error('Failed to update task');
      }
      const data = (await res.json()) as { task: V2TaskItem };
      await fetchTasks(data.task.tag || activeTag);
      await fetchNextTask(data.task.tag || activeTag);
      return data.task;
    },
    [activeTag, fetchNextTask, fetchTasks]
  );

  const deleteTask = useCallback(
    async (id: number, original_id?: string) => {
      const res = await fetch(`${API_BASE}/api/v2/tasks`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id, ...(original_id ? { original_id } : {}) }),
      });
      if (!res.ok) {
        throw new Error('Failed to delete task');
      }
      await fetchTasks(activeTag);
      await fetchNextTask(activeTag);
    },
    [activeTag, fetchNextTask, fetchTasks]
  );

  const createSubtask = useCallback(
    async (taskId: number, subtaskData: CreateSubtaskData) => {
      const res = await fetch(`${API_BASE}/api/v2/tasks/${taskId}/subtasks`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(subtaskData),
      });
      if (!res.ok) {
        throw new Error('Failed to create subtask');
      }
      const data = (await res.json()) as { subtask: Subtask };
      await fetchSubtasks(taskId);
      return data.subtask;
    },
    [fetchSubtasks]
  );

  const updateSubtask = useCallback(
    async (taskId: number, subtaskId: number, updates: UpdateSubtaskData) => {
      const res = await fetch(`${API_BASE}/api/v2/tasks/${taskId}/subtasks`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id: subtaskId, ...updates }),
      });
      if (!res.ok) {
        throw new Error('Failed to update subtask');
      }
      const data = (await res.json()) as { subtask: Subtask };
      await fetchSubtasks(taskId);
      return data.subtask;
    },
    [fetchSubtasks]
  );

  const deleteSubtask = useCallback(
    async (taskId: number, subtaskId: number) => {
      const res = await fetch(`${API_BASE}/api/v2/tasks/${taskId}/subtasks`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id: subtaskId }),
      });
      if (!res.ok) {
        throw new Error('Failed to delete subtask');
      }
      await fetchSubtasks(taskId);
    },
    [fetchSubtasks]
  );

  const fetchData = useCallback(async () => {
    if (isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;
    setIsLoading(true);

    try {
      const fetchedTasks = await fetchTasks(activeTag);
      await fetchNextTask(activeTag);
      const taskTags = new Set<string>(['master', activeTag]);
      for (const task of fetchedTasks) {
        if (task.tag.trim()) {
          taskTags.add(task.tag);
        }
      }
      setTags(Array.from(taskTags).sort());
    } catch (error) {
      console.error('V2 polling error:', error);
    } finally {
      setIsLoading(false);
      isPollingRef.current = false;
    }
  }, [activeTag, fetchNextTask, fetchTasks, setIsLoading, setTags]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData]);

  return {
    fetchData,
    fetchTasks,
    fetchNextTask,
    fetchTags,
    createTask,
    updateTask,
    deleteTask,
    fetchSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
  };
}
