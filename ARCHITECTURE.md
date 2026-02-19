# OpenCode Dashboard — Architecture (v2)

## System Overview

```
                           ┌──────────────────────────────────────────────────────────┐
                           │                     MAC MINI (Agent Host)                │
                           │                                                          │
                           │  ┌──────────┐    ┌───────────┐    ┌──────────────────┐  │
                           │  │ OpenClaw │───>│ oh-my-    │───>│ dashboard-hook.ts│  │
                           │  │ (primary │    │ opencode  │    │ (sends events)   │  │
                           │  │  agent)  │    │ framework │    └────────┬─────────┘  │
                           │  └────┬─────┘    └───────────┘             │             │
                           │       │                                    │             │
                           │       │ spawns sub-agents                  │ HTTP POST   │
                           │       │ (explore, oracle, etc.)            │ + API key   │
                           │       │                                    │             │
                           │  ┌────▼─────────────────┐                 │             │
                           │  │ Temporal Worker       │                 │             │
                           │  │ (orchestrates tasks)  │─ signals ──────│             │
                           │  └──────────────────────┘                 │             │
                           └───────────────────────────────────────────│─────────────┘
                                                                       │
                             ┌─────────────────────────────────────────▼──────────────┐
                             │              DASHBOARD BACKEND (Next.js)                │
                             │              bound to 127.0.0.1:3000                    │
                             │                                                         │
                             │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
                             │  │ /api/events │  │ /api/agents  │  │ /api/projects │  │
                             │  │ /api/todos  │  │ /api/agent/  │  │ /api/linear/  │  │
                             │  │ /api/msgs   │  │   :id/profile│  │   webhook     │  │
                             │  │ /api/sess   │  │   :id/tasks  │  │   sync        │  │
                             │  └──────┬──────┘  └──────┬───────┘  └──────┬────────┘  │
                             │         │                │                 │            │
                             │         ▼                ▼                 ▼            │
                             │  ┌──────────────────────────────────────────────────┐   │
                             │  │                   SQLite (local)                 │   │
                             │  │  agents | tasks | messages | sessions | settings │   │
                             │  │  ───────────────────────────────────────────────  │  │
                             │  │  + linear_cache (projects, issues, states)        │   │
                             │  └──────────────────────────────────────────────────┘   │
                             │         │                                  │            │
                              │         │ SSE/WebSocket                    │ GraphQL    │
                              │         │ (replaces polling)               │            │
                              └─────────│──────────────────────────────────│────────────┘
                                        │                                  │
                 ┌──────────────────────▼─────┐                  ┌────────▼──────────┐
                 │     WEB CLIENTS (Browsers)  │                  │   Linear API       │
                 │  (via SSH Tunnel/Tailscale) │                  │   api.linear.app   │
                 │                             │                  │                    │
                 │  - Real-time updates        │                  │  - OAuth2 tokens   │
                 │  - Agent monitoring         │                  │  - GraphQL queries │
                 │  - Project kanban           │                  │  - Webhooks ──────>│
                 │                             │                  │    (Issue, Project  │
                 │                             │                  │     Comment, Cycle) │
                 │                             │                  └───────────────────┘
                 │                             │
                 │         ┌──────────────────────────────┐
                 │         │  SSH Tunnel / Tailscale       │
                 │◄────────│  (laptop → mac mini)          │
                 └─────────┴──────────────────────────────┘
```

---

## Data Flow: Linear Integration

```
   Linear Workspace                 Dashboard Backend
   ═══════════════                  ═════════════════
                                                                 
   Issue created ──webhook POST──> /api/linear/webhook             
                                    │                              
                                    ├─ verify signature            
                                    │  (LINEAR_WEBHOOK_SECRET)     
                                    │                              
                                    ├─ upsert to linear_cache      
                                    │  table in SQLite             
                                    │                              
                                    └─ push SSE event ──────────> real-time update
                                                                   (to web clients)
                                                                 
   ◄──── GraphQL mutation ────────  /api/linear/sync               
     (issue.update stateId)         (card drag-and-drop)           
                                                                 
   ◄──── GraphQL query ───────────  /api/projects                  
     (full project sync)            (periodic background           
                                     sync every 60s)              
```

### Webhook Events to Subscribe

| Resource Type | Events | What We Do |
|---------------|--------|------------|
| `Issue` | created, updated, removed | Upsert issue in `linear_cache`, push SSE |
| `Project` | updated | Update project progress/status |
| `Comment` | created | Show as message in feed (optional) |
| `Cycle` | updated | Update sprint/cycle progress |

### Linear SDK Integration

```typescript
// Server-side only — @linear/sdk
import { LinearClient } from "@linear/sdk";

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

// Fetch project kanban
const project = await linear.project("project-id");
const issues = await project.issues({ first: 100 });
for (const issue of issues.nodes) {
  const state = await issue.state;  // WorkflowState: backlog | started | completed
  // state.type: "backlog" | "unstarted" | "started" | "completed" | "cancelled"
}

// Move card (drag-and-drop action)
await linear.updateIssue("issue-id", { stateId: "new-state-id" });
```

---

## Data Flow: Agent Monitoring

```
  OpenClaw Agent                 Temporal Workflow              Dashboard
  ══════════════                 ═════════════════              ═════════
                                                              
  Agent starts ──────────────>  agentTaskWorkflow()            
                                 │                             
                                 ├─ register agent in DB       
                                 │  (name, created_at,         
                                 │   soul_md, skills)          
                                 │                             
                                 ├─ activity: startAgent()     
                                 │                             
                                 ├─ activity: monitorProgress()
                                 │   │                         
                                 │   ├─ poll agent state       
                                 │   │  every 10s              
                                 │   │                         
                                 │   ├─ if blocked >10min     
                                 │   │  + high priority:       
                                 │   │  → signal: BLOCKED      
                                 │   │  → push notification    
                                 │   │                         
                                 │   ├─ if blocked >1hr       
                                 │   │  + low priority:        
                                 │   │  → signal: BLOCKED      
                                 │   │  → push notification    
                                 │   │                         
                                 │   └─ if completed:          
                                 │      → signal: DONE         
                                 │                             
                                  ├─ on BLOCKED signal:         
                                  │   wait for human unblock    ◄── user clicks "Unblock"
                                  │   (workflow.signal)                in dashboard
                                 │                             
                                 └─ on DONE / CANCELLED:       
                                    update agent status        
                                    in DB                       
```

---

## Database Schema (v2)

```sql
-- Existing tables (keep as-is)
-- todos, messages, sessions, settings

-- New: Agent tracking
CREATE TABLE agents (
  id TEXT PRIMARY KEY,                    -- e.g. "openclaw-main", "explore-abc123"
  name TEXT NOT NULL,                     -- display name
  type TEXT NOT NULL,                     -- "primary" | "sub-agent"
  parent_agent_id TEXT REFERENCES agents(id),
  status TEXT DEFAULT 'idle',             -- idle | working | blocked | sleeping | offline
  soul_md TEXT,                           -- markdown content of agent's soul/personality
  skills TEXT,                            -- JSON array: ["playwright", "git-master", ...]
  current_task_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  last_heartbeat INTEGER,
  config TEXT                             -- JSON blob for agent-specific config
);

-- New: Agent tasks (links agents to Linear issues when applicable)
CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  linear_issue_id TEXT,                   -- nullable — not all tasks are Linear issues
  project_id TEXT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',          -- pending | in_progress | blocked | completed | cancelled
  priority TEXT DEFAULT 'medium',
  blocked_reason TEXT,
  blocked_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- New: Linear cache (denormalized for fast reads)
CREATE TABLE linear_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  state TEXT,                             -- planned | started | paused | completed | cancelled
  progress REAL DEFAULT 0,               -- 0.0 to 1.0
  start_date TEXT,
  target_date TEXT,
  url TEXT,
  team_id TEXT,
  team_name TEXT,
  prod_url TEXT,                          -- user-configured production link
  synced_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE linear_issues (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES linear_projects(id),
  identifier TEXT,                        -- e.g. "ENG-123"
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER,                       -- 0=none, 1=urgent, 2=high, 3=medium, 4=low
  state_name TEXT,                        -- e.g. "In Progress"
  state_type TEXT,                        -- backlog | unstarted | started | completed | cancelled
  assignee_name TEXT,
  assignee_avatar TEXT,
  label_names TEXT,                       -- JSON array
  estimate INTEGER,
  url TEXT,
  agent_task_id TEXT REFERENCES agent_tasks(id),  -- which agent is working on this
  synced_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE linear_workflow_states (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                     -- backlog | unstarted | started | completed | cancelled
  color TEXT,
  position REAL
);

-- New: Notification preferences
CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,                  -- "blocked" | "completed" | "error" | "idle_too_long"
  priority_filter TEXT,                   -- "high" | "medium" | "low" | "all"
  delay_ms INTEGER DEFAULT 0,            -- how long to wait before alerting
  channel TEXT NOT NULL,                  -- "push" | "in_app" | "both"
  enabled INTEGER DEFAULT 1
);

-- New: User auth
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id TEXT UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT,
  linear_access_token TEXT,              -- encrypted
  created_at INTEGER DEFAULT (unixepoch()),
  last_login INTEGER
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,              -- SHA-256 of bearer token
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## Technology Additions

| Layer | Current | Adding |
|-------|---------|--------|
| Linear | None | @linear/sdk + webhook receiver + LinearWebhookClient signature verify |
| Real-time | 3s polling | Server-Sent Events (SSE) via Next.js route handlers |
| Agent orchestration | None | Temporal.io TypeScript SDK (workflows + activities + workers) |
