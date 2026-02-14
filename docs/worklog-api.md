# Worklog Message API

## Endpoint
`POST /api/messages/create`

## Auth
Send bearer auth in the `Authorization` header (same API key model as other dashboard endpoints):

`Authorization: Bearer <DASHBOARD_API_KEY>`

## Request Body
```json
{
  "type": "worklog",
  "content": "Completed API wiring for message autopost. #todo_ab12cd",
  "session_id": "session_123",
  "todo_id": null,
  "metadata": {
    "author": "build-agent",
    "tags": ["backend", "autopost"],
    "summary_id": "summary_2026_02_14_001"
  }
}
```

- `type`: one of `task_complete | error | state_change | custom | worklog`
- `content`: required string, 1..10000 chars
- `session_id`: optional nullable string
- `todo_id`: optional nullable string
- `metadata`: optional object
  - `author`: optional string
  - `tags`: optional string[]
  - `summary_id`: optional string (idempotency key)

## Idempotency
If `metadata.summary_id` is present, the API scans existing messages and returns the existing message (HTTP 200, `deduplicated: true`) when it finds a prior entry containing that summary id marker. Otherwise it creates a new message (HTTP 201).

## curl Example
```bash
curl -X POST "http://localhost:3000/api/messages/create" \
  -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type":"worklog",
    "content":"Refactored summary posting flow. #todo_42",
    "session_id":"session_abc",
    "metadata":{"author":"assistant","tags":["worklog"],"summary_id":"sum-42"}
  }'
```

## dashboard-hook Usage
```ts
await dashboardHook.onWorkLogSummary("Shipped endpoint + hook integration. #todo_42", {
  sessionId: "session_abc",
  agentName: "assistant",
  tags: ["release", "worklog"],
  summaryId: "sum-42",
});
```

## Todo Refs
Include `#todo_*` references in `content` when possible. The dashboard UI renders these refs as clickable todo chips.
