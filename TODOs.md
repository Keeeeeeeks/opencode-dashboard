# OpenCode Dashboard — TODOs

Master task list for building the v2 web dashboard with Linear integration and agent monitoring.

Reference docs:
- `ARCHITECTURE.md` — system architecture, data flows, DB schema
- `.env.example` — all environment variables

---

## Phase 0: Fix Security Gaps ✅

- [x] **0.1** Add `Authorization: Bearer <DASHBOARD_API_KEY>` middleware to all API routes
- [x] **0.2** Fix CORS — replace `Access-Control-Allow-Origin: *` with allowlist
- [x] **0.3** Add rate limiting to write endpoints
- [x] **0.4** Update `opencode-hook/dashboard-hook.ts` to send API key

---

## Phase 1: Auth, Projects & Team ✅

### 1A — Database: project_id everywhere + users/team tables ✅

- [x] **1A.1** Add `project_id TEXT` column to `messages`, `sessions`, `tasks`, `sprints`, `todo_comments`
- [x] **1A.2** Create `users` table (github_id, username, display_name, avatar_url, role)
- [x] **1A.3** Create `auth_sessions` table (token_hash SHA-256, expires_at)
- [x] **1A.4** Create `invite_links` table (created_by, role, expires_at, used_by)
- [x] **1A.5** Create `projects` table + seed from existing todos

### 1B — GitHub OAuth flow ✅

- [x] **1B.1** `.env.example` documents `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
  - ⚠️ **User action needed**: Create GitHub OAuth App at github.com/settings/developers
  - Callback URL: `https://clawdinas-mac-mini.tail677558.ts.net/opencode/api/auth/callback`
  - `.env.local` has placeholders ready to fill
- [x] **1B.2** `GET /api/auth/login` — redirects to GitHub with state param + CSRF cookie
- [x] **1B.3** `GET /api/auth/callback` — exchanges code, fetches user, creates session
  - First user becomes owner; subsequent users need invite link or direct add
  - Invite-link users are created with viewer role at callback, upgraded at accept
- [x] **1B.4** `GET /api/auth/verify` — reads cookie/header, checks expiry, returns user
  - Supports `DISABLE_AUTH=true` for Tailscale-only setups
- [x] **1B.5** `POST /api/auth/logout` — deletes session, clears cookie
- [ ] **1B.6** Multiple GitHub accounts per browser (account switcher)
  - Low priority nice-to-have

### 1C — Auth middleware ✅

- [x] **1C.1** `validateAuth()` accepts API key (machine) + session token (browser)
- [x] **1C.2** `requireRole()` with owner > admin > viewer hierarchy

### 1D — Team management ✅

- [x] **1D.1** `GET /api/settings/team` — returns all users (owner only)
- [x] **1D.2** `POST /api/settings/team/invite` — direct add by GitHub username + invite link mode
- [x] **1D.3** `DELETE /api/settings/team/:userId` — remove user + sessions
- [x] **1D.4** `PATCH /api/settings/team/:userId` — update role
- [x] **1D.5** `/invite/[id]` landing page + `/invite/[id]/accept` page
- [x] **1D.6** Settings page at `/settings` — team list, add member, invite link, projects

### 1E — Project selector ✅

- [x] **1E.1** Project dropdown in header (next to sprint picker)
- [x] **1E.2** Filter todos, messages, sprints by selected project
  - URL param `?project=cookbook` for shareable links
- [x] **1E.3** Todos API accepts `project` field on create/update; hook sends project via payload

### 1F — Login page ✅

- [x] **1F.1** `/login` page with "Sign in with GitHub" button
- [x] **1F.2** `AuthGuard` component wraps `/`, `/analytics`, `/settings`
  - Zustand auth store (`useAuthStore`) for user state

---

## Phase 2: Real-Time (SSE) ✅

- [x] **2.1** `GET /api/stream` — SSE endpoint with auth (token query param), ping keepalive
- [x] **2.2** `eventBus` singleton — in-memory EventEmitter, `publish()` method
  - Events: `todo:updated`, `todo:created`, `todo:deleted`, `message:created`, `sprint:updated`, `sprint:created`, `agent:status`, `project:updated`
  - 21 `eventBus.publish()` calls across 13 API route files
- [x] **2.3** `useSSE` hook — EventSource with reconnection, fallback to 3s polling on failure
- [x] **2.4** Polling is fallback only; SSE is primary transport

---

## Phase 3: Agent Monitoring ✅ (dashboard side)

- [x] **3.1** `agents` and `agent_tasks` tables with full schema + indexes
- [x] **3.3** `GET /api/agents` — enriched with current_task, sub_agent_count, age_seconds
- [x] **3.4** `GET/PATCH/DELETE /api/agents/[id]` — full agent CRUD
- [x] **3.5** Agent action endpoints:
  - `POST /api/agents/[id]/actions` — sleep, stop, unblock, restart
  - `POST /api/agents/[id]/assign` — assign task
  - `POST /api/agents/[id]/block` — mark blocked
  - `POST /api/agents/[id]/complete` — complete task
  - `POST /api/agents/[id]/error` — report error
  - `POST /api/agents/[id]/heartbeat` — heartbeat
  - `POST /api/agents/[id]/tasks` — create/list tasks
  - `PATCH /api/agents/[id]/tasks/[taskId]` — update task
  - `POST /api/agents/[id]/workflow` — workflow management
  - `POST /api/agents/[id]/workflow/signal` — workflow signals
- [x] **3.6** Agent age — computed `age_seconds` from `created_at`
- [x] **3.7** Agent hierarchy — `parent_agent_id` + `sub_agent_count` in enrichment
- [x] **3.UI** AgentPanel, AgentCard, AgentDetailModal components + Agents tab on dashboard
- [ ] **3.2** Agent registration hook for oh-my-opencode `BackgroundManager`
  - Requires upstream oh-my-opencode integration release
  - Hook calls: POST on spawn, PATCH on heartbeat, PATCH on complete/error
- [ ] **3.8** Track oh-my-opencode integration release status

---

## Phase 4: Linear Integration ✅ (dashboard side)

- [x] **4.1** `@linear/sdk` installed (v75)
- [x] **4.2** `linear_projects`, `linear_issues`, `linear_workflow_states` tables
- [x] **4.4** `POST /api/linear/webhook` — HMAC signature verification, issue/project/cycle handlers, auto-assignment to agents
- [x] **4.5** `POST /api/linear/sync` — full sync (teams → states → projects → issues)
- [x] **4.6** `PATCH /api/linear/sync` — card drag handler (updates issue state via Linear API + local cache)
- [x] **4.8** Agent-to-issue linking (`linkAgentToIssue`, `agent_task_id` on issues)
- [x] **4.UI** LinearBoard, LinearProjectSelector, LinearIssueCard components + Linear tab on dashboard
- [x] **4.3** Linear client (`src/lib/linear/client.ts`) — uses `LINEAR_API_KEY` env var
  - ⚠️ **User action needed**: Add `LINEAR_API_KEY` to `.env.local` to enable sync
- [ ] **4.7** Programmatic webhook registration via `webhookCreate` mutation
  - Currently manual: register at linear.app/settings/api/webhooks

---

## Phase 5: Temporal Agent Orchestration — DEFERRED

> The lifecycle manager (`src/lib/agents/lifecycle.ts`) implements agent orchestration
> with in-memory timers instead of Temporal. All Phase 5 features work today without
> Temporal. Temporal adds crash recovery and durable retry — upgrade when needed.

- [ ] **5.1** Install Temporal TypeScript SDK
- [ ] **5.2** Run Temporal server (Docker or Temporal Cloud)
- [ ] **5.3** Define `agentTaskWorkflow`
- [ ] **5.4** Define activities (start, monitor, notify, update)
- [ ] **5.5** Implement sleep/wake signals via Temporal conditions

---

## Phase 6: Alerting ✅ (in-memory engine)

- [x] **6.1** `alert_rules` table with full schema
- [x] **6.2** Default alert rules seeded (blocked, error, completed, idle, stale)
- [x] **6.3** Alert engine (`src/lib/alerts/engine.ts`) — processes events, matches rules, fires notifications
  - Lifecycle manager calls `alertEngine.processEvent()` on block/complete/idle
- [x] **6.5** `GET/PUT /api/settings/alerts` + `DELETE /api/settings/alerts/[id]`
- [ ] **6.4** Push notification channel (currently in-app only)
  - Needs: push notification service integration (web push or mobile)

---

## Phase 7: Agent Lifecycle ✅ (in-memory manager)

> `src/lib/agents/lifecycle.ts` — full lifecycle manager singleton

- [x] **7.1** Task assignment (`assignTask`) — creates agent_task, sets agent working, links to Linear issue
- [x] **7.2** Block detection (`detectBlocked`) — explicit, repeated_errors (3+ in window), idle (5min no heartbeat)
  - Auto-triggers alerting via alert engine
- [x] **7.3** Message throttling (`shouldSendMessage`) — max 3 pushes per agent per hour
- [x] **7.4** Sleep/wake management:
  - `triggerSleep` — manual, error threshold (5 in 10min), scheduled window
  - `triggerWake` — manual, new high-priority task
  - `isInSleepWindow` — timezone-aware schedule check
  - `GET/PUT /api/settings/sleep-schedule` endpoint
- [x] **7.5** Task completion (`completeTask`) — updates status, checks for pending work, auto-sleeps if in window
- [x] **7.6** Idle monitoring — 5min timer per agent, auto-detects blocked state

---

## Phase 9: Web Dashboard ✅

- [x] **9.1** Agent monitoring panel (AgentPanel tab)
- [x] **9.2** Linear kanban view (LinearBoard tab)
- [x] **9.3** SSE on web (useSSE hook)
- [x] **9.4** Login page (GitHub OAuth)

---

## Phase 10: Testing — NOT STARTED

- [ ] **10.1** API tests: auth middleware, CORS, rate limiting
- [ ] **10.2** Integration tests: hook → API → DB → SSE → web flow
- [ ] **10.3** Linear webhook signature verification test
- [ ] **10.4** Agent lifecycle tests: block → alert → unblock cycle
- [ ] **10.5** Load test: concurrent agents posting updates

---

## Remaining Work (priority order)

### Blocked on user action:
1. **Create GitHub OAuth App** — github.com/settings/developers → fill `GITHUB_CLIENT_ID`/`SECRET` in `.env.local` → set `DISABLE_AUTH=false`
2. **Add LINEAR_API_KEY** — linear.app/settings/api → fill in `.env.local`

### Nice-to-haves:
3. **1B.6** — Account switcher for multiple GitHub accounts
4. **4.7** — Programmatic Linear webhook registration
5. **6.4** — Push notification channel
6. **Phase 5** — Temporal upgrade (when crash recovery is needed)
7. **Phase 10** — Test suite

### External dependencies:
8. **3.2** — oh-my-opencode BackgroundManager hook integration (blocked on upstream release)

---

## Dependency Map

```
Phase 0 (Security) ✅
  └──> Phase 1 (Auth) ✅ ──> Phase 2 (SSE) ✅ ──> Phase 3 (Agents) ✅ ──> Phase 5 (Temporal) ○
                                                                              └──> Phase 6 (Alerting) ✅
                                                                              └──> Phase 7 (Lifecycle) ✅
                              ──> Phase 4 (Linear) ✅ ──> Phase 9 (Web) ✅
All ──> Phase 10 (Testing) ○
```

✅ = Complete    ○ = Not started / Deferred
