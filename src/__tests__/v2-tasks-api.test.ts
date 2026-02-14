/**
 * V2 Tasks API Integration Tests
 *
 * Tests: create ticket, edit ticket, move ticket (status change), remove ticket
 *
 * Run: DASHBOARD_API_KEY=test123 npx tsx src/__tests__/v2-tasks-api.test.ts
 */

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const API_KEY = process.env.DASHBOARD_API_KEY || 'test123';

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  };
}

let createdTaskId: number | null = null;
let createdSubtaskId: number | null = null;
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

async function testCreateTicket() {
  console.log('\n📋 Test: Create a ticket');

  const res = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title: 'Implement user authentication',
      description: 'Add JWT-based auth to the API',
      priority: 'high',
      tag: 'test-suite',
    }),
  });

  const data = await res.json();

  assert(res.status === 200 || res.status === 201, `Status 200/201 (got ${res.status})`);
  assert(data.task !== undefined, 'Response contains task');
  assert(data.task.title === 'Implement user authentication', 'Title matches');
  assert(data.task.priority === 'high', 'Priority matches');
  assert(data.task.status === 'pending', 'Default status is pending');
  assert(data.task.tag === 'test-suite', 'Tag matches');
  assert(typeof data.task.id === 'number', 'ID is a number');

  createdTaskId = data.task.id;
}

async function testEditTicket() {
  console.log('\n✏️  Test: Edit a ticket');

  assert(createdTaskId !== null, 'Have a task ID from creation');

  const res = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      id: createdTaskId,
      title: 'Implement user authentication (v2)',
      description: 'Add JWT-based auth with refresh tokens',
      details: '## Implementation Plan\n1. Set up JWT signing\n2. Add refresh token rotation',
      test_strategy: 'Unit test token generation, integration test login flow',
    }),
  });

  const data = await res.json();

  assert(res.status === 200, `Status 200 (got ${res.status})`);
  assert(data.task.title === 'Implement user authentication (v2)', 'Title updated');
  assert(data.task.description === 'Add JWT-based auth with refresh tokens', 'Description updated');
  assert(data.task.details !== null, 'Details field set');
  assert(data.task.test_strategy !== null, 'Test strategy field set');

  // Verify by re-fetching
  const getRes = await fetch(`${API_BASE}/api/v2/tasks?tag=test-suite`, {
    headers: authHeaders(),
  });
  const getData = await getRes.json();
  const task = getData.tasks.find((t: any) => t.id === createdTaskId);
  assert(task !== undefined, 'Task found in list');
  assert(task.title === 'Implement user authentication (v2)', 'Title persisted after re-fetch');
}

async function testMoveTicket() {
  console.log('\n🔄 Test: Move ticket (change status)');

  // Move to in_progress
  let res = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ id: createdTaskId, status: 'in_progress' }),
  });
  let data = await res.json();
  assert(res.status === 200, `Status 200 for in_progress (got ${res.status})`);
  assert(data.task.status === 'in_progress', 'Status changed to in_progress');

  // Move to review
  res = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ id: createdTaskId, status: 'review' }),
  });
  data = await res.json();
  assert(res.status === 200, `Status 200 for review (got ${res.status})`);
  assert(data.task.status === 'review', 'Status changed to review');

  // Move to done
  res = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ id: createdTaskId, status: 'done' }),
  });
  data = await res.json();
  assert(res.status === 200, `Status 200 for done (got ${res.status})`);
  assert(data.task.status === 'done', 'Status changed to done');

  // Move to blocked
  res = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ id: createdTaskId, status: 'blocked' }),
  });
  data = await res.json();
  assert(res.status === 200, `Status 200 for blocked (got ${res.status})`);
  assert(data.task.status === 'blocked', 'Status changed to blocked');
}

async function testSubtasks() {
  console.log('\n📎 Test: Subtask CRUD');

  // Create subtask
  let res = await fetch(`${API_BASE}/api/v2/tasks/${createdTaskId}/subtasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title: 'Set up JWT signing keys' }),
  });
  let data = await res.json();
  assert(res.status === 200 || res.status === 201, `Create subtask: status 200/201 (got ${res.status})`);
  assert(data.subtask.title === 'Set up JWT signing keys', 'Subtask title matches');
  createdSubtaskId = data.subtask.id;

  // List subtasks
  res = await fetch(`${API_BASE}/api/v2/tasks/${createdTaskId}/subtasks`, {
    headers: authHeaders(),
  });
  data = await res.json();
  assert(res.status === 200, `List subtasks: status 200 (got ${res.status})`);
  assert(Array.isArray(data.subtasks), 'Subtasks is array');
  assert(data.subtasks.length >= 1, 'At least 1 subtask');

  // Update subtask
  res = await fetch(`${API_BASE}/api/v2/tasks/${createdTaskId}/subtasks`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ id: createdSubtaskId, status: 'done', title: 'Set up JWT signing keys (done)' }),
  });
  data = await res.json();
  assert(res.status === 200, `Update subtask: status 200 (got ${res.status})`);
  assert(data.subtask.status === 'done', 'Subtask status updated');

  // Delete subtask
  res = await fetch(`${API_BASE}/api/v2/tasks/${createdTaskId}/subtasks`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ id: createdSubtaskId }),
  });
  data = await res.json();
  assert(res.status === 200, `Delete subtask: status 200 (got ${res.status})`);
  assert(data.success === true, 'Subtask deleted');
}

async function testDependencies() {
  console.log('\n🔗 Test: Dependencies and Next Task');

  // Create a second task with dependency on first
  const res2 = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title: 'Add refresh token rotation',
      priority: 'medium',
      tag: 'test-suite',
      dependencies: JSON.stringify([createdTaskId]),
    }),
  });
  const data2 = await res2.json();
  assert(res2.status === 200 || res2.status === 201, 'Second task created');
  const task2Id = data2.task.id;

  // Create a third task with no dependencies
  const res3 = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title: 'Write documentation',
      priority: 'low',
      tag: 'test-suite',
      status: 'pending',
    }),
  });
  const data3 = await res3.json();
  assert(res3.status === 200 || res3.status === 201, 'Third task created');

  // Validate deps
  const valRes = await fetch(`${API_BASE}/api/v2/tasks/validate-deps`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ tag: 'test-suite' }),
  });
  const valData = await valRes.json();
  assert(valRes.status === 200, `Validate deps: status 200 (got ${valRes.status})`);
  assert(typeof valData.valid === 'boolean', 'Returns valid boolean');

  // Get next task (should be the one with no unmet deps)
  const nextRes = await fetch(`${API_BASE}/api/v2/tasks/next?tag=test-suite`, {
    headers: authHeaders(),
  });
  const nextData = await nextRes.json();
  assert(nextRes.status === 200, `Next task: status 200 (got ${nextRes.status})`);
  // The next task should be the one without blocked deps
  if (nextData.task) {
    assert(typeof nextData.task.title === 'string', 'Next task has title');
  }

  // Cleanup second and third tasks
  await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ id: task2Id }),
  });
  await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ id: data3.task.id }),
  });
}

async function testRemoveTicket() {
  console.log('\n🗑️  Test: Remove ticket');

  assert(createdTaskId !== null, 'Have a task ID to delete');

  const res = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ id: createdTaskId }),
  });

  const data = await res.json();

  assert(res.status === 200, `Status 200 (got ${res.status})`);
  assert(data.success === true, 'Delete returned success');

  // Verify task is gone
  const getRes = await fetch(`${API_BASE}/api/v2/tasks?tag=test-suite`, {
    headers: authHeaders(),
  });
  const getData = await getRes.json();
  const found = getData.tasks.find((t: any) => t.id === createdTaskId);
  assert(found === undefined, 'Task no longer in list');
}

async function testAuthRequired() {
  console.log('\n🔒 Test: Auth required');

  const res = await fetch(`${API_BASE}/api/v2/tasks`);
  assert(res.status === 401, `Unauthenticated GET returns 401 (got ${res.status})`);

  const res2 = await fetch(`${API_BASE}/api/v2/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Unauthorized task' }),
  });
  assert(res2.status === 401, `Unauthenticated POST returns 401 (got ${res2.status})`);
}

async function main() {
  console.log('🧪 V2 Tasks API Integration Tests');
  console.log(`   API: ${API_BASE}`);
  console.log('   ─────────────────────────────');

  try {
    await testCreateTicket();
    await testEditTicket();
    await testMoveTicket();
    await testSubtasks();
    await testDependencies();
    await testRemoveTicket();
    await testAuthRequired();
  } catch (err) {
    console.error('\n💥 Test runner error:', err);
    failed++;
  }

  console.log('\n═══════════════════════════════');
  console.log(`   Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
