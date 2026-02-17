import db from '../src/lib/db';

type SeedTodoInput = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled' | 'icebox';
  priority: 'low' | 'medium' | 'high';
  parent_id?: string;
};

function createTodo(input: SeedTodoInput) {
  return db.createTodo({
    id: input.id,
    content: input.content,
    status: input.status,
    priority: input.priority,
    agent: null,
    project: 'milestone-5',
    parent_id: input.parent_id ?? null,
    session_id: null,
  });
}

function log(message: string) {
  console.log(`[seed] ${message}`);
}

function createSprintWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 13);
  end.setHours(23, 59, 59, 999);

  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

async function main() {
  const seedKey = `${Date.now()}`;
  const sprintWindow = createSprintWindow();

  log('Creating parent tasks');
  const parentA = createTodo({
    id: `todo_seed_${seedKey}_parent_a`,
    content: 'Milestone 5: hierarchy foundations',
    status: 'pending',
    priority: 'high',
  });
  const parentB = createTodo({
    id: `todo_seed_${seedKey}_parent_b`,
    content: 'Milestone 5: sprint planning and execution',
    status: 'pending',
    priority: 'medium',
  });
  log(`Created parents: ${parentA.id}, ${parentB.id}`);

  log('Creating child tasks');
  const childA1 = createTodo({
    id: `todo_seed_${seedKey}_child_a1`,
    content: 'Design subtask creation flow',
    status: 'completed',
    priority: 'high',
    parent_id: parentA.id,
  });
  const childA2 = createTodo({
    id: `todo_seed_${seedKey}_child_a2`,
    content: 'Implement drag state transitions',
    status: 'in_progress',
    priority: 'medium',
    parent_id: parentA.id,
  });
  const childB1 = createTodo({
    id: `todo_seed_${seedKey}_child_b1`,
    content: 'Define sprint velocity expectations',
    status: 'completed',
    priority: 'medium',
    parent_id: parentB.id,
  });
  const childB2 = createTodo({
    id: `todo_seed_${seedKey}_child_b2`,
    content: 'Connect sprint assignment endpoints',
    status: 'pending',
    priority: 'low',
    parent_id: parentB.id,
  });
  const childB3 = createTodo({
    id: `todo_seed_${seedKey}_child_b3`,
    content: 'Validate completion scoring',
    status: 'pending',
    priority: 'medium',
    parent_id: parentB.id,
  });
  log(`Created children: ${childA1.id}, ${childA2.id}, ${childB1.id}, ${childB2.id}, ${childB3.id}`);

  log('Creating comments across tasks');
  const comments = [
    db.createComment({
      todo_id: parentA.id,
      body: 'Parent task will remain pending while subtasks advance.',
      author: 'product',
    }),
    db.createComment({
      todo_id: childA2.id,
      body: 'Moving to in progress while preserving parent state.',
      author: 'engineer',
    }),
    db.createComment({
      todo_id: parentB.id,
      body: 'Sprint scope includes parent and leaf tasks.',
      author: 'manager',
    }),
    db.createComment({
      todo_id: childB1.id,
      body: 'Completed points should be reflected in velocity.',
      author: 'qa',
    }),
  ];
  log(`Created ${comments.length} comments`);

  log('Creating sprint');
  const sprint = db.createSprint({
    id: `sprint_seed_${seedKey}`,
    name: 'Sprint 1',
    start_date: sprintWindow.start,
    end_date: sprintWindow.end,
    goal: 'Validate hierarchy, comments, and velocity workflows',
    status: 'active',
  });
  log(`Created sprint: ${sprint.id}`);

  log('Assigning tasks to sprint');
  const sprintTodos = [parentA.id, childA1.id, childA2.id, childB1.id, childB3.id];
  for (const todoId of sprintTodos) {
    db.assignTodoToSprint(todoId, sprint.id);
  }
  log(`Assigned ${sprintTodos.length} tasks to ${sprint.name}`);

  log('Updating completion state for velocity sample');
  db.updateTodo(childA1.id, { status: 'completed' });
  db.updateTodo(childB1.id, { status: 'completed' });

  const velocity = db.getSprintVelocity(sprint.id);
  log(`Velocity points: ${velocity.completed_points}/${velocity.total_points}`);
  log('Seed data created successfully');
}

main()
  .catch((error) => {
    console.error('[seed] Failed to seed data', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
