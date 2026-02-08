# OpenCode Dashboard — Mobile Screen Map

Every screen, what's on it, and where the data comes from.

---

## Screen 0: Splash / Biometric Gate

```
┌─────────────────────────────┐
│                             │
│         ⚡ OpenCode         │
│                             │
│     ┌───────────────────┐   │
│     │    [Face ID icon]  │   │
│     │                   │   │
│     │  Unlock to continue│   │
│     └───────────────────┘   │
│                             │
│     [ Use Passcode ]        │
│                             │
└─────────────────────────────┘
```

**When shown**: App opens and `expo-secure-store` has an existing token.

**Data source**: Local only.
- `expo-secure-store.getItemAsync('github_token')` → token exists?
- `expo-local-authentication.authenticateAsync()` → FaceID/TouchID prompt

**Behavior**:
- Success → navigate to Home (Screen 2)
- Failure → show "Use Passcode" fallback or retry
- No stored token → navigate to Login (Screen 1)

**Packages**: `expo-local-authentication`, `expo-secure-store`

---

## Screen 1: Login (GitHub OAuth)

```
┌─────────────────────────────┐
│                             │
│         ⚡ OpenCode         │
│       Dashboard             │
│                             │
│   Monitor your agents.      │
│   Ship from your phone.     │
│                             │
│  ┌─────────────────────────┐│
│  │  🐙  Sign in with GitHub ││
│  └─────────────────────────┘│
│                             │
│   Privacy: your data stays  │
│   on your hardware.         │
│                             │
└─────────────────────────────┘
```

**When shown**: No stored token (first launch or logged out).

**Data flow**:
1. Tap "Sign in with GitHub" → `expo-auth-session.useAuthRequest()` opens system browser
2. User authorizes on github.com → redirect back with `?code=`
3. App exchanges code for token via `POST /api/auth/github` on dashboard backend
4. Backend verifies code with GitHub, creates `users` + `auth_sessions` row
5. App stores token in `expo-secure-store.setItemAsync('github_token', token)`
6. Navigate to Home (Screen 2)

**Backend endpoints**:
- `POST /api/auth/github` — exchange code for session token
- Creates row in `users` table (github_id, username, avatar)
- Creates row in `auth_sessions` table (token_hash, expires_at)

**Packages**: `expo-auth-session`, `expo-crypto`, `expo-web-browser`

---

## Screen 2: Home (Tab Selector)

```
┌─────────────────────────────┐
│ ⚡ OpenCode    [avatar] [⚙] │
│─────────────────────────────│
│                             │
│  ┌───────────┐ ┌──────────┐│
│  │           │ │          ││
│  │  🤖       │ │  📋      ││
│  │  Agents   │ │ Projects ││
│  │           │ │          ││
│  │  3 active │ │ 5 total  ││
│  │  1 blocked│ │ 2 active ││
│  │           │ │          ││
│  └───────────┘ └──────────┘│
│                             │
│  ── Recent Activity ──────  │
│  🟢 explore-7f2 completed   │
│     "Find auth patterns"    │
│     2 min ago               │
│                             │
│  🔴 openclaw blocked        │
│     "Waiting for API key"   │
│     15 min ago              │
│                             │
│  🟢 oracle-3a1 completed    │
│     "Architecture review"   │
│     1 hr ago                │
│                             │
│─────────────────────────────│
│  [🤖 Agents] [📋 Projects]  │
│  [🔔 3]     [⚙ Settings]   │
└─────────────────────────────┘
```

**Data sources**:
| Element | Source | Query |
|---------|--------|-------|
| Agent count (active/blocked) | SQLite `agents` table | `GET /api/agents?status=working,blocked` |
| Project count (total/active) | SQLite `linear_projects` table | `GET /api/projects` |
| Recent Activity feed | SQLite `messages` table | `GET /api/messages?limit=10` |
| Avatar | `users.github_avatar_url` | Cached from login |
| Unread badge (🔔 3) | SQLite `messages` | `GET /api/messages?unread_only=true` count |

**Navigation**: Bottom tab bar with 4 tabs: Agents, Projects, Notifications, Settings

---

## Screen 3: Agents List

```
┌─────────────────────────────┐
│ ← Agents                    │
│─────────────────────────────│
│                             │
│ ┌─────────────────────────┐ │
│ │ 🤖 OpenClaw             │ │
│ │ primary · working       │ │
│ │ ─────────────────────── │ │
│ │ Current: "Build kanban  │ │
│ │   board component"      │ │
│ │ Project: opencode-dash  │ │
│ │ Uptime: 3h 42m          │ │
│ │ ⚠ 1 unread message      │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🔍 explore-7f2a         │ │
│ │ sub-agent · completed   │ │
│ │ ─────────────────────── │ │
│ │ Task: "Find auth impls" │ │
│ │ Parent: OpenClaw        │ │
│ │ Duration: 45s           │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🧠 oracle-3a1b          │ │
│ │ sub-agent · idle        │ │
│ │ ─────────────────────── │ │
│ │ Last: "Review arch"     │ │
│ │ Parent: OpenClaw        │ │
│ │ Idle: 20m               │ │
│ └─────────────────────────┘ │
│                             │
│─────────────────────────────│
│  [🤖 Agents] [📋 Projects]  │
└─────────────────────────────┘
```

**Data source**: `GET /api/agents`

| Field | DB Column | Notes |
|-------|-----------|-------|
| Name | `agents.name` | "OpenClaw", "explore-7f2a" |
| Type badge | `agents.type` | "primary" or "sub-agent" |
| Status | `agents.status` | idle / working / blocked / sleeping / offline |
| Current task | `agent_tasks.title` via `agents.current_task_id` | |
| Project | `linear_projects.name` via `agent_tasks.project_id` | |
| Uptime / Duration | `agents.created_at` vs now | Computed client-side |
| Unread count | `messages` WHERE `session_id` matches agent | |
| Parent | `agents.parent_agent_id` → `agents.name` | For sub-agents |

**Tap behavior**: Navigate to Agent Profile (Screen 4)

---

## Screen 4: Agent Profile

```
┌─────────────────────────────┐
│ ← OpenClaw                  │
│─────────────────────────────│
│                             │
│  🤖 OpenClaw                │
│  primary agent · working    │
│  Age: 3 days                │
│  ──────────────────────     │
│                             │
│  ┌─ Status ───────────────┐ │
│  │ 🟢 Working              │ │
│  │ Current: "Build kanban" │ │
│  │ Started: 2:15 PM        │ │
│  │ Priority: high          │ │
│  └─────────────────────────┘ │
│                             │
│  ┌─ Projects ─────────────┐ │
│  │ • opencode-dashboard    │ │
│  │ • storyloom             │ │
│  └─────────────────────────┘ │
│                             │
│  ┌─ Skills ───────────────┐ │
│  │ playwright · git-master │ │
│  │ frontend-ui-ux          │ │
│  └─────────────────────────┘ │
│                             │
│  ┌─ Messages (2 unread) ──┐ │
│  │ 🔴 Blocked: need API   │ │
│  │    key for Linear       │ │
│  │    15 min ago           │ │
│  │                         │ │
│  │ 🟢 Completed: "Set up  │ │
│  │    auth middleware"     │ │
│  │    1 hr ago             │ │
│  └─────────────────────────┘ │
│                             │
│  ┌─ Sub-Agents ───────────┐ │
│  │ explore-7f2a  ✅ done   │ │
│  │ oracle-3a1b   💤 idle   │ │
│  │ librarian-9c  🔄 working│ │
│  └─────────────────────────┘ │
│                             │
│  [ View Soul.md ]           │
│                             │
│  ┌─ Actions ──────────────┐ │
│  │ [💤 Sleep] [🔄 Restart] │ │
│  │ [🚫 Stop]  [📝 Message] │ │
│  └─────────────────────────┘ │
│                             │
└─────────────────────────────┘
```

**Data sources**:
| Section | Source | Query |
|---------|--------|-------|
| Header info | `agents` table | `GET /api/agents/:id` |
| Status block | `agents` + `agent_tasks` | JOIN on `current_task_id` |
| Projects | `agent_tasks` → `linear_projects` | `GET /api/agents/:id/tasks?distinct=project_id` |
| Skills | `agents.skills` | JSON array stored in column |
| Messages | `messages` WHERE agent matches | `GET /api/messages?agent_id=:id` |
| Sub-agents | `agents` WHERE `parent_agent_id` = this | `GET /api/agents?parent=:id` |
| Soul.md | `agents.soul_md` | Markdown content, rendered with react-native-markdown |
| Age | `agents.created_at` | Computed: `now - created_at` |

**Actions**:
- **Sleep**: `POST /api/agents/:id/sleep` → Temporal signal `sleepSignal`
- **Restart**: `POST /api/agents/:id/restart` → kill + re-spawn workflow
- **Stop**: `POST /api/agents/:id/stop` → Temporal cancel workflow
- **Message**: Opens in-app compose → creates `messages` row visible to agent

---

## Screen 4b: Soul.md Viewer (Modal)

```
┌─────────────────────────────┐
│ Soul.md — OpenClaw    [ ✕ ] │
│─────────────────────────────│
│                             │
│  # OpenClaw                 │
│                             │
│  You are a senior engineer  │
│  working on the opencode    │
│  dashboard project.         │
│                             │
│  ## Personality              │
│  - Methodical, thorough     │
│  - Prefers small PRs        │
│  - Tests before shipping    │
│                             │
│  ## Constraints              │
│  - Never push to main       │
│  - Always run linter        │
│  - Ask before deleting      │
│                             │
└─────────────────────────────┘
```

**Data source**: `agents.soul_md` column — rendered as markdown.

---

## Screen 5: Projects List

```
┌─────────────────────────────┐
│ ← Projects                  │
│─────────────────────────────│
│                             │
│ ┌─────────────────────────┐ │
│ │ 📋 opencode-dashboard   │ │
│ │ Status: started (72%)   │ │
│ │ ████████████░░░░░ 72%   │ │
│ │ Agents: OpenClaw, explore│ │
│ │ Issues: 12 open / 8 done│ │
│ │ 🔗 localhost:3000        │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 📋 storyloom            │ │
│ │ Status: planned (0%)    │ │
│ │ ░░░░░░░░░░░░░░░░░ 0%   │ │
│ │ Agents: none assigned   │ │
│ │ Issues: 5 open / 0 done │ │
│ │ 🔗 storyloom.app         │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 📋 ai-wallet            │ │
│ │ Status: paused (40%)    │ │
│ │ ██████░░░░░░░░░░░ 40%   │ │
│ │ Agents: none (paused)   │ │
│ │ Issues: 8 open / 5 done │ │
│ │ 🔗 —                     │ │
│ └─────────────────────────┘ │
│                             │
└─────────────────────────────┘
```

**Data sources**:
| Field | Source | Notes |
|-------|--------|-------|
| Project name | `linear_projects.name` | Synced from Linear |
| Status | `linear_projects.state` | planned/started/paused/completed/cancelled |
| Progress bar | `linear_projects.progress` | 0.0 to 1.0, from Linear API |
| Agents | `agent_tasks` WHERE `project_id` = this → `agents.name` | JOIN |
| Issue counts | `linear_issues` WHERE `project_id` = this, GROUP BY `state_type` | |
| Prod link | `linear_projects.prod_url` | User-configured |

**Tap behavior**: Navigate to Project Dashboard (Screen 6)

---

## Screen 6: Project Dashboard (Kanban)

```
┌─────────────────────────────┐
│ ← opencode-dashboard        │
│   72% · 3 agents · 20 issues│
│─────────────────────────────│
│                             │
│ [Kanban] [Activity] [Info]  │
│                             │
│ ┌────────┬────────┬────────┐│
│ │Backlog │In Prog │ Done   ││
│ │        │        │        ││
│ │┌──────┐│┌──────┐│┌──────┐││
│ ││ENG-12│││ENG-8 │││ENG-3 │││
│ ││Add   │││Fix   │││Setup │││
│ ││auth  │││CORS  │││DB    │││
│ ││      │││      │││      │││
│ ││P:high│││P:med │││P:high│││
│ ││🤖 OC │││🤖 OC │││✅    │││
│ │└──────┘│└──────┘│└──────┘││
│ │        │        │        ││
│ │┌──────┐│┌──────┐│┌──────┐││
│ ││ENG-14│││ENG-11│││ENG-5 │││
│ ││Rate  │││WSock │││Zod   │││
│ ││limit │││ets   │││valid │││
│ ││      │││      │││      │││
│ ││P:med │││🔍 exp│││✅    │││
│ │└──────┘│└──────┘│└──────┘││
│ └────────┴────────┴────────┘│
│                             │
└─────────────────────────────┘
```

**Data sources**:
| Element | Source | Query |
|---------|--------|-------|
| Column layout | `linear_workflow_states` WHERE `team_id` | Ordered by `position` |
| Cards | `linear_issues` WHERE `project_id` | Grouped by `state_type` |
| Card identifier | `linear_issues.identifier` | "ENG-12" |
| Card title | `linear_issues.title` | Truncated |
| Card priority | `linear_issues.priority` | 0-4 mapped to icons |
| Agent badge | `linear_issues.agent_task_id` → `agent_tasks.agent_id` → `agents.name` | Shows which agent is working on it |
| Progress header | `linear_projects.progress` | |

**Card drag**: Dragging a card across columns → `POST /api/linear/sync` → `linearClient.updateIssue(id, { stateId })` → updates Linear + local cache.

**Sub-tabs**:
- **Kanban**: The board above
- **Activity**: Agent messages filtered to this project (`GET /api/messages?project_id=:id`)
- **Info**: Project metadata, target date, team, prod URL, cycle info

---

## Screen 7: Notifications

```
┌─────────────────────────────┐
│ Notifications          [✓all]│
│─────────────────────────────│
│                             │
│ ── Today ──────────────     │
│                             │
│ 🔴 BLOCKER · 15 min ago     │
│ OpenClaw is blocked on      │
│ "Add Linear webhook"        │
│ Reason: Missing LINEAR_API  │
│ _KEY in .env.local          │
│ [ Unblock ] [ View Task ]   │
│                             │
│ 🟢 Completed · 1 hr ago     │
│ explore-7f2a finished       │
│ "Find auth implementations" │
│ Duration: 45s               │
│                             │
│ ⚠️  Error · 2 hrs ago        │
│ oracle-3a1b failed          │
│ "TypeError: Cannot read     │
│  property 'id' of undefined"│
│ [ View Stack Trace ]        │
│                             │
│ ── Yesterday ──────────     │
│                             │
│ 🟢 Completed · 18 hrs ago   │
│ OpenClaw finished           │
│ "Set up project scaffolding"│
│                             │
└─────────────────────────────┘
```

**Data source**: `GET /api/messages` with decrypted content.

| Field | Source |
|-------|--------|
| Type icon | `messages.type` → 🔴 blocker, 🟢 completed, ⚠️ error, 🔄 state_change |
| Time | `messages.created_at` → relative time (date-fns `formatDistanceToNow`) |
| Content | `messages.content` (decrypted) |
| Agent name | `messages.session_id` → `agents.name` lookup |
| Actions | Contextual: "Unblock" sends Temporal signal, "View Task" navigates |

**"Unblock" action**: `POST /api/agents/:id/unblock` → Temporal `unblockSignal` on the workflow → agent resumes.

---

## Screen 8: Settings

```
┌─────────────────────────────┐
│ ← Settings                  │
│─────────────────────────────│
│                             │
│ ── Account ────────────     │
│ GitHub: @keeeeeeeks         │
│ [ Log Out ]                 │
│                             │
│ ── Connection ─────────     │
│ Dashboard URL:              │
│ ┌─────────────────────────┐ │
│ │ http://127.0.0.1:3000   │ │
│ └─────────────────────────┘ │
│ Status: 🟢 Connected        │
│                             │
│ ── Linear ─────────────     │
│ Workspace: connected ✅      │
│ [ Disconnect Linear ]       │
│                             │
│ ── Security ───────────     │
│ Biometric Lock: [  ON  ]    │
│ Auto-lock after: [ 5 min ]  │
│                             │
│ ── Notifications ──────     │
│ Push notifications: [ ON ]  │
│ Blocker alerts: [ Immediate]│
│ Completion alerts: [ Batch ]│
│ Error alerts: [ Immediate ] │
│                             │
│ ── Alert Rules ────────     │
│ High priority block: 10 min │
│ Low priority block: 1 hour  │
│ Idle agent alert: 30 min    │
│ [ Edit Rules ]              │
│                             │
└─────────────────────────────┘
```

**Data sources**:
| Section | Source |
|---------|--------|
| Account | `users` table (github_username, avatar) |
| Dashboard URL | `expo-secure-store` / Zustand store |
| Linear status | Check if `users.linear_access_token` exists |
| Security toggles | `expo-secure-store` local preferences |
| Notification prefs | `alert_rules` table via `GET /api/settings/alerts` |

---

## Navigation Structure

```
App Root
├── [No token] → Screen 1: Login
├── [Has token] → Screen 0: Biometric Gate
│   └── Success → Screen 2: Home
│
└── Bottom Tab Navigator
    ├── 🤖 Agents Tab
    │   ├── Screen 3: Agents List
    │   └── Screen 4: Agent Profile
    │       └── Screen 4b: Soul.md Modal
    │
    ├── 📋 Projects Tab
    │   ├── Screen 5: Projects List
    │   └── Screen 6: Project Dashboard (Kanban)
    │
    ├── 🔔 Notifications Tab
    │   └── Screen 7: Notifications
    │
    └── ⚙ Settings Tab
        └── Screen 8: Settings
```

---

## API Endpoints Required (New)

| Endpoint | Method | Screen(s) | Description |
|----------|--------|-----------|-------------|
| `/api/auth/github` | POST | 1 | Exchange OAuth code for session token |
| `/api/auth/verify` | GET | 0 | Verify stored token is still valid |
| `/api/agents` | GET | 2, 3 | List all agents with status |
| `/api/agents/:id` | GET | 4 | Agent profile with tasks, skills, soul |
| `/api/agents/:id/tasks` | GET | 4 | Agent's task history |
| `/api/agents/:id/sleep` | POST | 4 | Send sleep signal via Temporal |
| `/api/agents/:id/stop` | POST | 4 | Cancel agent workflow |
| `/api/agents/:id/unblock` | POST | 7 | Send unblock signal via Temporal |
| `/api/projects` | GET | 2, 5 | List all Linear projects with progress |
| `/api/projects/:id` | GET | 6 | Project detail with issues |
| `/api/projects/:id/issues` | GET | 6 | Issues grouped by workflow state |
| `/api/linear/webhook` | POST | — | Receive Linear webhook events |
| `/api/linear/sync` | POST | 6 | Sync issue state change to Linear |
| `/api/settings/alerts` | GET/PUT | 8 | Alert rule configuration |
