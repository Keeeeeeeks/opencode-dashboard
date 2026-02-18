# API Reference

REST API for the OpenClaw Dashboard. All endpoints require `Authorization: Bearer $DASHBOARD_API_KEY`.

---

## Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/events` | POST | Receive events from oh-my-opencode hook |
| `/api/todos` | GET | List todos. Query params: `session_id`, `status` (comma-separated), `since` (timestamp), `id` (single), `parent_id`, `top_level=true`, `sprint_id`, `project`, `agent` |
| `/api/todos` | POST | Create or update a single todo. Body: `{id?, content, status?, priority?, parent_id?, sprint_id?, agent?, project?, session_id?}` |
| `/api/todos` | PUT | Batch create/update todos. Body: `{todos: [{id, content, status?, priority?, ...}, ...]}` |
| `/api/sessions` | GET | List all sessions |
| `/api/sessions` | POST | Create a session. Body: `{id?, name?, started_at?}` |
| `/api/messages` | GET | List messages. Query params: `unread_only=true`, `since` (timestamp) |
| `/api/messages` | POST | Mark messages as read. Body: `{ids: [1, 2, 3]}` |
| `/api/messages/create` | POST | Create a message. Body: `{type, content, todo_id?, session_id?}` |

## Hierarchy & Comments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/todos/[id]/subtasks` | GET | List child tasks of parent |
| `/api/todos/[id]/subtasks` | POST | Create child task. Body: `{content, priority?}` |
| `/api/todos/[id]/comments` | GET | List comments on a task |
| `/api/todos/[id]/comments` | POST | Create comment. Body: `{body, author?}` |

## Sprints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sprints` | GET | List all sprints |
| `/api/sprints` | POST | Create sprint. Body: `{id?, name, start_date, end_date, goal?, status?}` |
| `/api/sprints/[id]` | GET | Get sprint by ID |
| `/api/sprints/[id]` | PATCH | Update sprint (e.g., status lifecycle). Body: `{status?, name?, goal?}` |
| `/api/sprints/[id]/velocity` | GET | Get sprint velocity + daily burndown data |
| `/api/todos/[id]/sprints` | GET | List sprints a task belongs to |
| `/api/todos/[id]/sprints` | POST | Assign task to sprint. Body: `{sprint_id}` |
| `/api/todos/[id]/sprints` | DELETE | Remove task from sprint. Body: `{sprint_id}` |

## Analytics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analytics` | GET | Analytics data. Query params: `start` (timestamp), `end` (timestamp), `sprint_id?`, `project?`, `agent?` |

Returns:
- `throughput.weekly` -- Weekly completed task count
- `created_vs_completed.weekly` -- Created vs completed by week
- `cycle_time` -- Average, median, per-task cycle time
- `lead_time` -- Average, median lead time
- `status_distribution` -- Task count by status
- `priority_distribution` -- Task count by priority
- `agent_workload` -- Per-agent task breakdown
- `velocity_trend` -- Sprint velocity over time

## V2 Planner (Internal)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/tasks` | GET | List V2 tasks (structured planning) |
| `/api/v2/tasks` | POST | Create V2 task. Body: `{tag?, title, description?, status?, priority?, dependencies?, details?, test_strategy?, complexity_score?, assigned_agent_id?, linear_issue_id?}` |
| `/api/v2/tasks/[id]/subtasks` | GET | List V2 subtasks |
| `/api/v2/tasks/[id]/subtasks` | POST | Create V2 subtask. Body: `{title, description?, status?, dependencies?, details?}` |
| `/api/v2/tasks/next` | GET | Get next actionable V2 task (no blocking dependencies) |
| `/api/v2/tasks/validate-deps` | POST | Validate V2 task dependencies. Body: `{dependencies: [1, 2, 3]}` |

---

## Database Schema

All tables use SQLite with WAL mode and foreign key constraints enabled.

### `todos`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `session_id` | TEXT | | Session identifier |
| `content` | TEXT | NOT NULL | Task description |
| `status` | TEXT | DEFAULT 'pending' | One of: pending, in_progress, blocked, completed, cancelled, icebox |
| `priority` | TEXT | DEFAULT 'medium' | One of: low, medium, high |
| `agent` | TEXT | | Agent name |
| `project` | TEXT | | Project identifier |
| `parent_id` | TEXT | FK -> todos.id CASCADE DELETE | Parent task ID (for hierarchy) |
| `completed_at` | INTEGER | | UNIX timestamp when status changed to completed |
| `created_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |
| `updated_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |

Indexes: `session_id`, `parent_id`

### `todo_comments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `todo_id` | TEXT | FK -> todos.id CASCADE DELETE | Task this comment belongs to |
| `body` | TEXT | NOT NULL | Markdown-lite comment text |
| `author` | TEXT | DEFAULT 'anonymous' | Comment author |
| `created_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |

Indexes: `todo_id`

### `todo_status_history`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `todo_id` | TEXT | FK -> todos.id CASCADE DELETE | Task that changed |
| `old_status` | TEXT | | Previous status (NULL for creation) |
| `new_status` | TEXT | NOT NULL | New status |
| `changed_by` | TEXT | | Agent or user who made the change |
| `changed_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |

Indexes: `todo_id`, `changed_at`

### `sprints`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL | Sprint name |
| `start_date` | INTEGER | NOT NULL | UNIX timestamp |
| `end_date` | INTEGER | NOT NULL | UNIX timestamp |
| `goal` | TEXT | | Sprint goal |
| `status` | TEXT | DEFAULT 'planning' | One of: planning, active, completed |
| `created_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |
| `updated_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |

### `todo_sprints`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `todo_id` | TEXT | FK -> todos.id CASCADE DELETE | Task ID |
| `sprint_id` | TEXT | FK -> sprints.id CASCADE DELETE | Sprint ID |

Primary Key: `(todo_id, sprint_id)`. Indexes: `sprint_id`, `todo_id`

### `messages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `type` | TEXT | NOT NULL | Message type |
| `content` | TEXT | NOT NULL | Encrypted message content (NaCl secretbox) |
| `todo_id` | TEXT | | Optional task link |
| `session_id` | TEXT | | Optional session link |
| `read` | INTEGER | DEFAULT 0 | 0 = unread, 1 = read |
| `created_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |

Indexes: `todo_id`, `session_id`, `read`

### `sessions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Session UUID |
| `name` | TEXT | | Session name |
| `started_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |
| `ended_at` | INTEGER | | UNIX timestamp (NULL if active) |

### `settings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | Setting key |
| `value` | TEXT | | Setting value (JSON string) |

### `tasks` (V2 System)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `tag` | TEXT | DEFAULT 'master' | Task tag |
| `title` | TEXT | NOT NULL | Task title |
| `description` | TEXT | | Task description |
| `status` | TEXT | DEFAULT 'pending' | Task status |
| `priority` | TEXT | DEFAULT 'medium' | Task priority |
| `dependencies` | TEXT | | JSON array of task IDs |
| `details` | TEXT | | Additional details |
| `test_strategy` | TEXT | | Testing approach |
| `complexity_score` | REAL | | Complexity estimate |
| `assigned_agent_id` | TEXT | | Agent assignment |
| `linear_issue_id` | TEXT | | Linear issue link |
| `created_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |
| `updated_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |

Indexes: `tag`, `status`

### `subtasks` (V2 System)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | | Subtask ID (scoped to task) |
| `task_id` | INTEGER | FK -> tasks.id CASCADE DELETE | Parent task |
| `title` | TEXT | NOT NULL | Subtask title |
| `description` | TEXT | | Subtask description |
| `status` | TEXT | DEFAULT 'pending' | Subtask status |
| `dependencies` | TEXT | | JSON array of subtask IDs |
| `details` | TEXT | | Additional details |
| `created_at` | INTEGER | DEFAULT unixepoch() | UNIX timestamp |

Primary Key: `(task_id, id)`. Indexes: `task_id`

---

## Conventions for Agents

### Authentication

All API calls require the `Authorization` header:

```
Authorization: Bearer $DASHBOARD_API_KEY
```

Validation uses timing-safe comparison. Requests without valid auth return `401 Unauthorized`.

### Timestamps

All timestamps are UNIX epoch seconds (not milliseconds).

```javascript
const now = Math.floor(Date.now() / 1000);
```

### IDs

- **Todo IDs**: String UUIDs (e.g., `"550e8400-e29b-41d4-a716-446655440000"`)
- **Sprint IDs**: String UUIDs (auto-generated if not provided)
- **Message IDs**: Integer autoincrement
- **Session IDs**: String UUIDs

### Status Values

**Todos**: `pending`, `in_progress`, `blocked`, `completed`, `cancelled`, `icebox`

**Sprints**: `planning`, `active`, `completed`

**V2 Tasks**: `pending`, `in_progress`, `blocked`, `completed`, `cancelled`

### Priority Values

`low`, `medium`, `high`

### Velocity Points

- **Low priority** = 1 point
- **Medium priority** = 3 points
- **High priority** = 5 points

### Hierarchy Rules

- Maximum depth: 3 levels
- Circular references are rejected
- Deleting a parent cascades to all children
- Child tasks can have different status than parent

### Rate Limiting

Default: 60 requests per 60-second window per IP.

Configurable via:
- `RATE_LIMIT_WINDOW_MS` (default: 60000)
- `RATE_LIMIT_MAX_REQUESTS` (default: 60)

Rate limit applies to POST/PUT/PATCH/DELETE endpoints only.

### V1 vs V2 Systems

- **V1** (`/api/todos`): Kanban board, sprints, comments, hierarchy
- **V2** (`/api/v2/tasks`): Structured planner with dependencies, complexity scores, tags

V2 merges V1 todos as negative-ID tasks for unified view at `/v2`. Both systems coexist independently.

---

## CLI Usage

```bash
# Set your API key
export DASHBOARD_API_KEY="your-key-here"

# List all todos
curl -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  http://127.0.0.1:3000/api/todos

# Filter by status
curl -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  "http://127.0.0.1:3000/api/todos?status=in_progress,blocked"

# Get a single todo
curl -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  "http://127.0.0.1:3000/api/todos?id=<todo-id>"

# Create a todo
curl -X POST http://127.0.0.1:3000/api/todos \
  -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Implement feature X",
    "status": "pending",
    "priority": "high",
    "agent": "sisyphus",
    "project": "dashboard"
  }'

# Update a todo
curl -X POST http://127.0.0.1:3000/api/todos \
  -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "<todo-id>",
    "status": "completed"
  }'

# Create a child task
curl -X POST http://127.0.0.1:3000/api/todos/<parent-id>/subtasks \
  -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Subtask 1",
    "priority": "medium"
  }'

# Add a comment
curl -X POST http://127.0.0.1:3000/api/todos/<todo-id>/comments \
  -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "**Ready for review**",
    "author": "alex"
  }'

# Create a sprint
curl -X POST http://127.0.0.1:3000/api/sprints \
  -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sprint 1",
    "start_date": 1735689600,
    "end_date": 1736899199,
    "goal": "Ship analytics dashboard",
    "status": "active"
  }'

# Assign task to sprint
curl -X POST http://127.0.0.1:3000/api/todos/<todo-id>/sprints \
  -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sprint_id": "<sprint-id>"}'

# Get sprint velocity
curl -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  http://127.0.0.1:3000/api/sprints/<sprint-id>/velocity

# Get analytics for last 30 days
START=$(date -v-30d +%s)
END=$(date +%s)
curl -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  "http://127.0.0.1:3000/api/analytics?start=$START&end=$END"
```

### Seeding Data

Populate sample data for testing:

```bash
bun run seed
```

Creates 20 sample todos, 3 sprints with assignments, parent/child relationships, and comments.

### Testing

```bash
bun run test:e2e
```

Playwright e2e tests covering task CRUD, drag-and-drop, comments, sprints, and hierarchy.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HOST` | No | `127.0.0.1` | Bind address. Keep as loopback. |
| `PORT` | No | `3000` | Server port |
| `DASHBOARD_API_KEY` | **Yes** | -- | Shared secret for API auth (`openssl rand -hex 32`) |
| `ALLOWED_ORIGINS` | No | `http://127.0.0.1:3000,http://localhost:3000` | Comma-separated CORS allowlist |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX_REQUESTS` | No | `60` | Max requests per window per IP |
| `DASHBOARD_URL` | No | `http://127.0.0.1:3000` | Used by opencode-hook (agent side) |
| `DATA_DIR` | No | `~/.opencode-dashboard` | SQLite DB and encryption key location |
| `ASSET_PREFIX` | No | -- | Set to subpath when behind a reverse proxy (e.g. `/opencode`) |
