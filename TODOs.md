# OpenCode Dashboard — TODOs

Master task list for building the v2 web dashboard with Linear integration and agent monitoring.

Reference docs:
- `ARCHITECTURE.md` — system architecture, data flows, DB schema
- `Compound_eng.md` — original session log with known issues
- `.env.example` — all environment variables

---

## Phase 0: Fix Security Gaps (from Compound_eng.md audit)

> These are blocking. Nothing else ships until auth works.

- [x] **0.1** Add `Authorization: Bearer <DASHBOARD_API_KEY>` middleware to all API routes
  - `src/lib/auth/middleware.ts` — timing-safe Bearer token validation + audit logging
  - Applied to all 16 route files (GET + POST/PUT/DELETE)
- [x] **0.2** Fix CORS — replace `Access-Control-Allow-Origin: *` with allowlist
  - `corsHeaders()` reads `ALLOWED_ORIGINS` env, reflects matching origin, sets `Vary: Origin`
  - Applied to all route files + OPTIONS handlers
- [x] **0.3** Add rate limiting to write endpoints
  - In-memory sliding window in `checkRateLimit()`, configurable via env
  - Applied to all POST/PUT/DELETE endpoints, returns `Retry-After` header
- [x] **0.4** Update `opencode-hook/dashboard-hook.ts` to send API key
  - `getAuthHeaders()` sends `Authorization: Bearer ${DASHBOARD_API_KEY}` on all fetch calls

---

## Phase 1: Auth, Projects & Team

> Goal: GitHub login, project-scoped data across all tables, team allowlist
> managed from dashboard UI. Tailscale remains the network gate; GitHub auth
> gates the app layer. Path B design — no multi-tenant encryption yet.

### 1A — Database: project_id everywhere + users/team tables

- [ ] **1A.1** Add `project_id TEXT` column to all tables missing it
  - `messages` — which venture produced this message
  - `sessions` — which venture this agent session belongs to
  - `tasks` (v2) — add `project_id` alongside existing `tag` (tag = workflow label, project = venture)
  - `sprints` — scope sprints per venture
  - `todo_comments` — inherit via todo or explicit column
  - All columns nullable for backwards compat; existing rows get `project_id = NULL` (= "unscoped")
  - Migration in `src/lib/db/index.ts` following existing ALTER TABLE pattern
- [ ] **1A.2** Create `users` table
  ```sql
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    github_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',  -- 'owner' | 'admin' | 'viewer'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  ```
- [ ] **1A.3** Create `auth_sessions` table
  ```sql
  CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,       -- SHA-256 of bearer token
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  ```
- [ ] **1A.4** Create `invite_links` table
  ```sql
  CREATE TABLE invite_links (
    id TEXT PRIMARY KEY,            -- short random ID (URL slug)
    created_by INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'viewer',
    expires_at INTEGER NOT NULL,    -- 24h from creation
    used_by INTEGER REFERENCES users(id),
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );
  ```
- [ ] **1A.5** Create `projects` table (registry of known ventures)
  ```sql
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,            -- 'cookbook', 'crypto-attestation', etc.
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,                     -- hex color for UI badges
    created_at INTEGER NOT NULL
  );
  ```
  Seed with existing project values from todos table on migration.

### 1B — GitHub OAuth flow

- [ ] **1B.1** Create GitHub OAuth App (or use existing)
  - Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.env.example`
  - Callback URL: `http://127.0.0.1:3000/api/auth/callback`
- [ ] **1B.2** Build `GET /api/auth/login` — redirects to GitHub OAuth authorize URL
  - Include `state` param (random, stored in cookie) for CSRF protection
- [ ] **1B.3** Build `GET /api/auth/callback` — handles OAuth redirect
  - Verify `state` matches cookie
  - Exchange `code` for GitHub access token (server-side)
  - Fetch user profile from GitHub API (`/user`)
  - Check allowlist: if `users` table is empty, first user becomes `owner`
  - If `users` table is non-empty, user must already exist OR have a valid invite link
  - Upsert `users` row (github_id, username, avatar_url)
  - Create `auth_sessions` row with SHA-256 hashed bearer token
  - Set token in httpOnly cookie + return to dashboard
- [ ] **1B.4** Build `GET /api/auth/verify` endpoint
  - Read token from cookie (or Authorization header for API clients)
  - Look up `auth_sessions`, check expiry
  - Return `{ valid, user }` — used by frontend on app open
- [ ] **1B.5** Build `POST /api/auth/logout`
  - Delete `auth_sessions` row, clear cookie
- [ ] **1B.6** Support multiple GitHub accounts per browser
  - Account switcher dropdown showing all accounts that have authenticated
  - "Add another account" triggers new OAuth flow with `login` param (GitHub re-prompts)
  - Active session stored in cookie; switching accounts swaps the active session token

### 1C — Update auth middleware

- [ ] **1C.1** Extend `validateAuth()` to accept session tokens (cookie or header)
  - API key still valid for hook-to-backend (machine auth)
  - Session token valid for browser-to-backend (user auth)
  - Middleware checks for either; attaches `user` to request context if session-authed
- [ ] **1C.2** Add `requireRole(minRole)` middleware helper
  - `owner` > `admin` > `viewer`
  - Write endpoints require `admin`+; read endpoints require `viewer`+
  - Settings/team management requires `owner`

### 1D — Team management (Settings UI)

- [ ] **1D.1** Build `GET /api/settings/team` — returns all users with roles
  - Requires `owner` role
- [ ] **1D.2** Build `POST /api/settings/team/invite` — two modes:
  - **Direct add**: `{ github_username, role }` — adds user to allowlist immediately
    - Fetches GitHub user ID via API to validate username exists
    - Creates `users` row with `role` (no auth_session yet — they log in later)
  - **Invite link**: `{ role, expires_in_hours }` — creates `invite_links` row
    - Returns URL: `/invite/{id}`
    - Default 24h expiry, single use
- [ ] **1D.3** Build `DELETE /api/settings/team/:userId` — remove user + their sessions
  - Cannot remove self (owner)
- [ ] **1D.4** Build `PATCH /api/settings/team/:userId` — update role
- [ ] **1D.5** Build `GET /invite/:id` page
  - Shows: "You've been invited to OpenCode Dashboard. Sign in with GitHub to continue."
  - On GitHub auth, checks invite validity (not expired, not used)
  - Creates user, marks invite as used, redirects to dashboard
- [ ] **1D.6** Build Settings page at `/settings`
  - **Team section**: list of users with avatar, username, role, [Remove] button
  - **Add member**: text input for GitHub username + role selector + [Invite] button
  - **Invite link**: [Generate link] button → copyable URL with expiry countdown
  - **Projects section**: list of registered ventures with color badges (read-only for now)
  - Only accessible to `owner` role

### 1E — Project selector in dashboard header

- [ ] **1E.1** Add project selector dropdown to header (next to sprint picker)
  - "All Projects" default view
  - List populated from `projects` table
  - Selection stored in URL param `?project=cookbook` for shareable links
- [ ] **1E.2** Filter all data by selected project
  - Todos, messages, sessions, sprints, tasks, analytics — all scoped
  - "All Projects" shows everything (current behavior)
- [ ] **1E.3** Update hook to send `project` field
  - Add `PROJECT_ID` to hook env config
  - Hook sends `project` on all event/todo/session POST calls
  - Dashboard tags incoming data with project_id

### 1F — Login page

- [ ] **1F.1** Build `/login` page
  - Clean page with "Sign in with GitHub" button
  - If already authenticated, redirect to dashboard
  - After auth, redirect to original requested URL
- [ ] **1F.2** Add auth guard to all pages
  - Check session on page load (via `GET /api/auth/verify`)
  - If not authenticated, redirect to `/login`
  - Dashboard, settings, analytics — all gated

---

## Phase 2: Real-Time (Replace Polling)

- [ ] **2.1** Add SSE endpoint: `GET /api/stream`
  - Server-Sent Events via Next.js route handler (`ReadableStream`)
  - Events: `todo:updated`, `message:created`, `agent:status`, `linear:synced`
  - Require auth (bearer token in query param for SSE, since no custom headers)
- [ ] **2.2** Create event bus in backend
  - In-memory EventEmitter (single-process; SQLite is single-process anyway)
  - API routes emit events on writes: `eventBus.emit('todo:updated', todo)`
  - SSE handler subscribes and pushes to connected clients
- [ ] **2.3** Web: SSE migration for `src/hooks/usePolling.ts`
- [ ] **2.4** Remove 3-second polling interval as default

---

## Phase 3: Agent Monitoring

> oh-my-opencode's `BackgroundManager` is the source of truth for sub-agents.
> OpenClaw is a single agent — it doesn't spawn sub-agents itself.
> The multi-agent spawning (explore, oracle, librarian, etc.) happens in oh-my-opencode.

- [ ] **3.1** Create `agents` and `agent_tasks` tables (see ARCHITECTURE.md schema)
- [ ] **3.2** Build agent registration hook for oh-my-opencode
  - Hook into `BackgroundManager.onSubagentSessionCreated` callback
  - On spawn: `POST /api/agents` with name, type, parent, skills, soul_md
  - On task start: `POST /api/agents/:id/tasks` with task details
  - On heartbeat: `PATCH /api/agents/:id` with `last_heartbeat`, progress
  - On complete/error: `PATCH /api/agents/:id/tasks/:taskId` with final status
- [ ] **3.3** Build `GET /api/agents` endpoint
  - Return all agents with current status, task, and unread message count
  - Filter by: `status`, `type` (primary/sub-agent), `parent_agent_id`
- [ ] **3.4** Build `GET /api/agents/:id` endpoint
  - Full agent profile: status, skills, soul_md, task history, sub-agents
- [ ] **3.5** Build agent action endpoints
   - `POST /api/agents/:id/sleep` — pause agent (Temporal sleep signal or BackgroundManager cancel)
   - `POST /api/agents/:id/stop` — cancel agent workflow
   - `POST /api/agents/:id/unblock` — send unblock signal
   - `POST /api/agents/:id/restart` — re-launch with same config
- [ ] **3.6** Track agent "age" — computed from `agents.created_at`
- [ ] **3.7** Track agent hierarchy — `parent_agent_id` for sub-agent tree view
- [ ] **3.8** Track OpenClaw <-> oh-my-opencode integration release status
  - Current blocker: upstream oh-my-opencode release for OpenClaw callback integration is not live yet
  - Once released, wire in the new run/integration flags and update hook docs + dashboard event flow

---

## Phase 4: Linear Integration

- [ ] **4.1** Install `@linear/sdk` and `@linear/sdk/webhooks`
- [ ] **4.2** Create `linear_projects`, `linear_issues`, `linear_workflow_states` tables (see ARCHITECTURE.md)
- [ ] **4.3** Build Linear OAuth flow (or use personal API key for MVP)
  - Store `linear_access_token` in `users` table (encrypted)
  - Scopes needed: `read`, `write`, `issues:create`
- [ ] **4.4** Build `POST /api/linear/webhook` endpoint
  - Verify webhook signature with `LinearWebhookClient` + `LINEAR_WEBHOOK_SECRET`
  - Handle: Issue created/updated/removed, Project updated, Cycle updated
  - Upsert into `linear_issues` / `linear_projects` tables
   - Emit SSE event for real-time web update
- [ ] **4.5** Build project sync: `POST /api/linear/sync`
  - Full sync: fetch all projects + issues via `linearClient.projects()`, `project.issues()`
  - Incremental: use `updatedAt` filter for delta sync
  - Run on: app startup, webhook gaps, manual trigger
- [ ] **4.6** Build card drag handler for kanban
   - Web drags card → `POST /api/linear/sync` with `{ issueId, newStateId }`
   - Backend calls `linearClient.updateIssue(id, { stateId })` + updates local cache
   - Optimistic update on web, confirm via SSE
- [ ] **4.7** Register Linear webhook programmatically
   - `webhookCreate` mutation with `resourceTypes: ["Issue", "Project", "Cycle"]`
   - Store webhook ID for cleanup
- [ ] **4.8** Link agents to Linear issues
   - When agent starts work on a Linear issue, set `linear_issues.agent_task_id`
   - Show agent avatar/name on kanban card in web dashboard

---

## Phase 5: Temporal Agent Orchestration

> This is the "agent-as-durable-workflow" layer. Makes agents survive crashes,
> adds retry/timeout, and enables the blocking/alerting/sleep logic.

- [ ] **5.1** Install Temporal TypeScript SDK: `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`
- [ ] **5.2** Run Temporal server (Docker or Temporal Cloud)
  - Dev: `docker compose up` with Temporal dev server
  - Prod: Temporal Cloud (managed) or self-hosted
- [ ] **5.3** Define `agentTaskWorkflow`
  ```
  Workflow lifecycle:
  1. Register agent in DB
  2. Start agent activity (spawn via BackgroundManager)
  3. Monitor loop:
     a. Poll agent state every 10s (heartbeat)
     b. If blocked → emit BLOCKED signal
     c. If completed → emit DONE signal
     d. If error → retry (up to 3x) or emit ERROR
  4. On BLOCKED: start alerting timer (priority-based)
  5. Wait for unblock signal from human (or timeout)
  6. On DONE/CANCELLED: update DB, notify parent
  ```
- [ ] **5.4** Define activities
   - `startAgentActivity` — launches agent via oh-my-opencode BackgroundManager
   - `monitorAgentActivity` — polls agent progress, heartbeats to Temporal
   - `sendNotificationActivity` — notification via backend
   - `updateDashboardActivity` — writes agent status to SQLite
- [ ] **5.5** Implement sleep/wake signals
  - `sleepSignal` — workflow pauses, agent Worker shuts down
  - `wakeSignal` — workflow resumes, agent Worker re-spawns
  - Exposed via `POST /api/agents/:id/sleep` and `POST /api/agents/:id/wake`

---

## Phase 6: Deterministic Alerting Logic

> When to message the user, how often, and through what channel.

- [ ] **6.1** Create `alert_rules` table (see ARCHITECTURE.md schema)
- [ ] **6.2** Define default alert rules:

  | Trigger | Priority | Delay | Channel | Description |
  |---------|----------|-------|---------|-------------|
  | `blocked` | high | 0ms (immediate) | push + in_app | Agent blocked, needs human input |
  | `blocked` | medium | 10 min | push + in_app | Blocked but not urgent |
  | `blocked` | low | 1 hour | in_app only | Low-priority block, batch later |
  | `error` | all | 0ms | push + in_app | Agent threw error |
  | `completed` | high | 0ms | in_app | High-priority task done |
  | `completed` | medium/low | batch (15 min) | in_app | Batched completion digest |
  | `idle_too_long` | all | 30 min | in_app | Agent idle with pending tasks |
  | `stale_task` | all | 2 hours | push | Task not progressing |

- [ ] **6.3** Implement Temporal timer-based alerting in `agentTaskWorkflow`
  ```
  On block detected:
    1. Write blocked_reason + blocked_at to agent_tasks
    2. Look up alert_rules for (trigger="blocked", priority=task.priority)
    3. Start Temporal condition timer: `await condition(() => !isBlocked, delay_ms)`
    4. If timer expires (still blocked) → fire notification
    5. If unblocked before timer → cancel notification, resume work
  ```
- [ ] **6.4** Implement notification batching for low-priority completions
  - Accumulate events in workflow state
  - Every 15 min, flush batch as single push notification
  - "3 tasks completed in the last 15 minutes"
- [ ] **6.5** Build `GET /api/settings/alerts` and `PUT /api/settings/alerts` endpoints
   - Web Settings reads and updates these

---

## Phase 7: Agent Lifecycle Logic

> When to spin up agents, when to mark blocked, when to sleep.

- [ ] **7.1** Spinning up temporal agents per-task
  ```
  When a new Linear issue is assigned to an agent (via webhook or manual):
    1. Create agent_task row (status: pending)
    2. Start Temporal agentTaskWorkflow with { taskId, issueId, agentConfig }
    3. Workflow spawns agent via BackgroundManager
    4. Agent picks up task, starts working
    5. Dashboard shows agent as "working" on that issue
  ```

- [ ] **7.2** When to mark task as "blocked" and assign to human
  ```
  Auto-detect blocked state when:
    a. Agent explicitly reports blocked (via hook event)
    b. Agent asks a question and waits (detected via message pattern)
    c. Agent hits 3 consecutive errors on same file/action
    d. Agent has been idle >5 min with in_progress task
    e. Agent requests a tool/resource it doesn't have access to

  On blocked:
    1. Set agent_tasks.status = "blocked"
    2. Set agent_tasks.blocked_reason = <detected reason>
    3. Set agent_tasks.blocked_at = now
    4. Fire Temporal blockDetectedSignal
    5. Alert rule timer starts (see Phase 6)
     6. Dashboard shows blocker card with [Unblock] button
  ```

- [ ] **7.3** How often to send messages (frequency control)
  ```
  Message frequency rules:
    - Urgent/high + blocked: immediate push + in-app
    - Medium + blocked: wait 10 min, then push
    - Low + blocked: wait 1 hour, then in-app only
    - Task completed: batch completions every 15 min
    - Errors: immediate push (always)
    - Progress updates: never push, in-app only, max 1 per task per 5 min
    - Idle warnings: in-app only, max 1 per agent per 30 min

  Anti-spam:
    - Max 10 push notifications per hour (across all agents)
    - Max 3 pushes per agent per hour
    - Batch mode: if >5 events in 1 min, switch to digest
  ```

- [ ] **7.4** When to "sleep" (stop working on new tasks)
  ```
  Sleep triggers:
    a. User taps "Sleep" on agent profile (manual)
    b. All assigned tasks completed and no new tasks queued
    c. Repeated failures (>5 errors in 10 min) — auto-sleep + alert user
    d. Resource limit hit (API rate limit, token budget exceeded)
    e. Scheduled sleep window (e.g., 2am-6am to save power on Mac Mini)
     f. User sends "Do Not Disturb" signal from dashboard

   Sleep behavior:
     1. Agent finishes current atomic operation (don't interrupt mid-commit)
     2. Sets agent.status = "sleeping"
     3. Temporal workflow pauses via condition(() => !isSleeping)
     4. Worker optionally shuts down (saves compute)
     5. Dashboard shows sleeping indicator

  Wake triggers:
    a. User taps "Wake" on agent profile
    b. New high-priority task assigned
    c. Scheduled wake time reached
    d. Unblock signal received for a blocked task
  ```

---

## Phase 9: Web Dashboard Updates

- [ ] **9.1** Add agent monitoring panel to web dashboard
- [ ] **9.2** Add Linear kanban view (project selector + board)
- [ ] **9.3** Replace polling with SSE on web
- [ ] **9.4** Add login page (GitHub OAuth)

---

## Phase 10: Testing and Hardening

- [ ] **10.1** API tests: auth middleware, CORS, rate limiting
- [ ] **10.2** Integration tests: hook → API → DB → SSE → web flow
- [ ] **10.3** Linear webhook signature verification test
- [ ] **10.4** Temporal workflow tests: block → alert → unblock cycle
- [ ] **10.5** Load test: 100 concurrent agents posting updates

---

## Dependency Map

```
Phase 0 (Security)
  └──> Phase 1 (Auth) ──> Phase 2 (SSE)  ──> Phase 3 (Agents) ──> Phase 5 (Temporal)
                                                                      └──> Phase 6 (Alerting)
                                                                      └──> Phase 7 (Lifecycle)
                          ──> Phase 4 (Linear) ──> Phase 9 (Web)
All ──> Phase 10 (Testing)
```

Critical path: **0 → 1 → 2 → 3 → 4 → 9** (gets a working web dashboard with agents + Linear)

Temporal (5/6/7) can be added incrementally — agents work without it, they just lack durable retry and smart alerting.
