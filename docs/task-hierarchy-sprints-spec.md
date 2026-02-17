# Task Hierarchy + Comments + Sprint Metrics

## Context
The dashboard currently treats every todo as a flat card with no discussion history. We need roadmap-level planning features before spinning additional teams up: hierarchy (parent task split into implementation subtasks), inline comments for coordination, and the ability to group work into sprints and track velocity.

This spec is for one large OpenCode ticket. When the work lands, make sure to:

1. Update dashboard todo `todo_1771264631109_p965hh4dn` ("Dashboard: task hierarchy + comments + sprint metrics") after each milestone.
2. Commit + push branches to `clawdina/opencode-dashboard` via PRs (feature branches per milestone).
3. Post status + demo notes in the dashboard message feed referencing the todo id.

## Deliverables

### 1. Hierarchical tasks
- Add parent-child relationships to the `todos` table (parent_id nullable, cascade deletes).
- UI: show subtasks nested under parent cards with collapse/expand. Dragging a card into another column should respect parent constraints (children inherit parent status unless manually overridden).
- API: extend `/api/todos` GET/POST/PATCH to accept `parentId`; add `/api/todos/:id/subtasks` for finer-grained updates.
- Validation: prevent circular references; limit depth to 3 levels.

### 2. Comments on tasks
- New table `todo_comments` (id, todo_id, body, author, created_at). Support Markdown-lite (bold, italics, inline code) with sanitization.
- UI: comment drawer accessible from each card; show avatar initials + timestamp + relative time. Include quick shortcut to reference subtasks (`#todo_*`).
- API: `/api/todos/:id/comments` GET/POST with bearer auth; rate-limit writes (same window as tasks).
- Notifications: when a comment lands, raise a lightweight toast in the UI if the board is open to that card.

### 3. Sprints & velocity
- Add `sprints` table (id, name, start_date, end_date, goal, status). Many-to-many `todo_sprints` linking tasks to sprints.
- UI enhancements:
  - Sprint picker in the header to filter board columns.
  - Velocity widget in the right-hand pane: show completed story points per sprint (use existing `priority` values as weights for now: low=1, medium=3, high=5 until we add explicit points).
  - Burn-down chart (simple line chart) for the active sprint using day-level granularity.
- API endpoints: `/api/sprints`, `/api/sprints/:id/velocity` and ability to assign tasks to a sprint via PATCH on todo.

### 4. Migration + dev notes
- Create Prisma or raw SQL migrations for new tables/columns.
- Seed script updates so local devs have sample parent/child data, comments, and sprint history.
- Update README with instructions for hierarchy/comments/sprint usage.

### Acceptance tests
- Cypress/Playwright flow covering: create parent task → add 2 subtasks → drag child to `in_progress` while parent stays `pending`; add comments; assign tasks to a sprint and verify velocity widget updates after marking tasks `completed`.

## Implementation order (recommended)
1. Database migrations + API scaffolding for parent-child tasks.
2. UI for hierarchy (cards + drag/drop adjustments).
3. Comments backend + UI.
4. Sprint models/APIs followed by velocity widget + filters.
5. Documentation, seeds, automated tests.

Remember: every sub-milestone should end with (a) update todo `todo_1771264631109_p965hh4dn`, (b) commit/push feature branch → PR to `clawdina/opencode-dashboard`, (c) leave a dashboard message referencing screenshots or Loom links.
