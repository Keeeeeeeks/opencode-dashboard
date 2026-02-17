import { APIRequestContext, expect, request, test } from '@playwright/test';

const apiKey = process.env.DASHBOARD_API_KEY ?? 'test-api-key';

let api: APIRequestContext;

function runId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await api.post(path, { data: payload });
  expect(response.ok(), `Expected successful POST ${path}`).toBeTruthy();
  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await api.get(path);
  expect(response.ok(), `Expected successful GET ${path}`).toBeTruthy();
  return (await response.json()) as T;
}

test.beforeAll(async () => {
  api = await request.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
});

test.afterAll(async () => {
  await api.dispose();
});

test('API: create parent task and subtasks', async () => {
  const idSuffix = runId();
  const parentResponse = await postJson<{ todo: { id: string } }>('/api/todos', {
    id: `todo_e2e_parent_${idSuffix}`,
    content: `Parent ${idSuffix}`,
    status: 'pending',
    priority: 'high',
  });

  const parentId = parentResponse.todo.id;

  await postJson<{ todo: { id: string } }>(`/api/todos/${parentId}/subtasks`, {
    content: `Child 1 ${idSuffix}`,
    status: 'pending',
    priority: 'medium',
  });

  await postJson<{ todo: { id: string } }>(`/api/todos/${parentId}/subtasks`, {
    content: `Child 2 ${idSuffix}`,
    status: 'pending',
    priority: 'low',
  });

  const subtasksResponse = await getJson<{ subtasks: Array<{ id: string; parent_id: string | null }> }>(
    `/api/todos/${parentId}/subtasks`
  );

  expect(subtasksResponse.subtasks).toHaveLength(2);
  expect(subtasksResponse.subtasks.every((subtask) => subtask.parent_id === parentId)).toBeTruthy();
});

test('API: move child to in_progress while parent stays pending', async () => {
  const idSuffix = runId();

  const parentResponse = await postJson<{ todo: { id: string; content: string; status: string; priority: string } }>(
    '/api/todos',
    {
      id: `todo_e2e_parent_drag_${idSuffix}`,
      content: `Parent drag ${idSuffix}`,
      status: 'pending',
      priority: 'medium',
    }
  );
  const parentId = parentResponse.todo.id;

  const childResponse = await postJson<{ todo: { id: string; content: string; status: string; priority: string } }>(
    `/api/todos/${parentId}/subtasks`,
    {
      content: `Child drag ${idSuffix}`,
      status: 'pending',
      priority: 'high',
    }
  );

  await postJson<{ todo: { id: string; status: string } }>('/api/todos', {
    id: childResponse.todo.id,
    content: childResponse.todo.content,
    status: 'in_progress',
    priority: childResponse.todo.priority,
    parent_id: parentId,
  });

  const parentStatusResponse = await getJson<{ id: string; status: string }>(`/api/todos?id=${parentId}`);

  expect(parentStatusResponse.id).toBe(parentId);
  expect(parentStatusResponse.status).toBe('pending');

  const childListResponse = await getJson<{ subtasks: Array<{ id: string; status: string }> }>(`/api/todos/${parentId}/subtasks`);
  const updatedChild = childListResponse.subtasks.find((subtask) => subtask.id === childResponse.todo.id);

  expect(updatedChild).toBeTruthy();
  expect(updatedChild?.status).toBe('in_progress');
});

test('API: add and read comments', async () => {
  const idSuffix = runId();

  const todoResponse = await postJson<{ todo: { id: string } }>('/api/todos', {
    id: `todo_e2e_comments_${idSuffix}`,
    content: `Comment target ${idSuffix}`,
    status: 'pending',
    priority: 'medium',
  });

  const todoId = todoResponse.todo.id;

  await postJson<{ comment: { id: number; body: string; author: string } }>(`/api/todos/${todoId}/comments`, {
    body: `Comment body ${idSuffix}`,
    author: 'playwright',
  });

  const commentsResponse = await getJson<{ comments: Array<{ body: string; author: string }> }>(
    `/api/todos/${todoId}/comments`
  );

  const targetComment = commentsResponse.comments.find((comment) => comment.body === `Comment body ${idSuffix}`);
  expect(targetComment).toBeTruthy();
  expect(targetComment?.author).toBe('playwright');
});

test('API: create sprint, assign tasks, verify velocity', async () => {
  const idSuffix = runId();
  const now = Math.floor(Date.now() / 1000);
  const sprintEnd = now + 14 * 24 * 60 * 60;

  const sprintResponse = await postJson<{ sprint: { id: string } }>('/api/sprints', {
    name: `Sprint ${idSuffix}`,
    start_date: now,
    end_date: sprintEnd,
    goal: 'Validate velocity',
    status: 'active',
  });

  const sprintId = sprintResponse.sprint.id;

  const highTask = await postJson<{ todo: { id: string; content: string; priority: string } }>('/api/todos', {
    id: `todo_e2e_sprint_high_${idSuffix}`,
    content: `High task ${idSuffix}`,
    status: 'pending',
    priority: 'high',
    sprint_id: sprintId,
  });

  const mediumTask = await postJson<{ todo: { id: string; content: string; priority: string } }>('/api/todos', {
    id: `todo_e2e_sprint_medium_${idSuffix}`,
    content: `Medium task ${idSuffix}`,
    status: 'pending',
    priority: 'medium',
    sprint_id: sprintId,
  });

  await postJson<{ todo: { id: string; content: string; priority: string } }>('/api/todos', {
    id: `todo_e2e_sprint_low_${idSuffix}`,
    content: `Low task ${idSuffix}`,
    status: 'pending',
    priority: 'low',
    sprint_id: sprintId,
  });

  await postJson<{ todo: { id: string } }>('/api/todos', {
    id: highTask.todo.id,
    content: highTask.todo.content,
    status: 'completed',
    priority: highTask.todo.priority,
  });

  await postJson<{ todo: { id: string } }>('/api/todos', {
    id: mediumTask.todo.id,
    content: mediumTask.todo.content,
    status: 'completed',
    priority: mediumTask.todo.priority,
  });

  const velocityResponse = await getJson<{
    velocity: {
      sprint_id: string;
      total_points: number;
      completed_points: number;
      daily_progress: Array<{ date: string; completed: number; remaining: number }>;
    };
  }>(`/api/sprints/${sprintId}/velocity`);

  expect(velocityResponse.velocity.sprint_id).toBe(sprintId);
  expect(velocityResponse.velocity.total_points).toBe(9);
  expect(velocityResponse.velocity.completed_points).toBe(8);
  expect(velocityResponse.velocity.daily_progress.length).toBeGreaterThan(0);
});
