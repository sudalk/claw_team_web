# ClawTeam Web API Documentation

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

Currently no authentication required (local development).

---

## Teams API

### List Teams

Get all teams.

```
GET /teams
```

**Response:**
```json
{
  "teams": [
    {
      "id": "team-name",
      "name": "Team Name",
      "description": "Team description",
      "status": "active",
      "created_at": "2026-03-23T10:00:00Z",
      "leader": {
        "id": "agent-id",
        "name": "leader",
        "type": "leader",
        "joined_at": "2026-03-23T10:00:00Z",
        "inbox_count": 0
      },
      "stats": {
        "members": 3,
        "tasks_total": 10,
        "tasks_completed": 5,
        "tasks_pending": 3,
        "tasks_in_progress": 2,
        "tasks_blocked": 0
      },
      "members": [...]
    }
  ],
  "total": 1
}
```

---

### Create Team

Create a new team.

```
POST /teams
```

**Request Body:**
```json
{
  "name": "my-team",
  "description": "My team description"
}
```

**Response:** `201 Created`
```json
{
  "id": "my-team",
  "name": "my-team",
  "description": "My team description",
  "status": "active",
  "created_at": "2026-03-23T10:00:00Z",
  "leader": {...},
  "stats": {...},
  "members": [...]
}
```

---

### Get Team

Get a team by name.

```
GET /teams/{team_name}
```

**Response:** `200 OK` or `404 Not Found`

---

### Update Team

Update team metadata.

```
PATCH /teams/{team_name}
```

**Request Body:**
```json
{
  "name": "new-name",
  "description": "new description",
  "status": "active"
}
```

---

### Delete Team

Delete a team.

```
DELETE /teams/{team_name}
```

**Response:** `204 No Content` or `404 Not Found`

---

## Tasks API

### List Tasks

List all tasks in a team.

```
GET /teams/{team_name}/tasks
GET /teams/{team_name}/tasks?status=pending
```

**Query Parameters:**
- `status` (optional): `pending`, `in_progress`, `completed`, `blocked`

**Response:**
```json
{
  "tasks": [
    {
      "id": "task-id",
      "team_id": "team-name",
      "subject": "Task title",
      "description": "Task description",
      "status": "pending",
      "priority": "medium",
      "assignee": {
        "id": "agent-id",
        "name": "agent-name"
      },
      "created_at": "2026-03-23T10:00:00Z",
      "updated_at": "2026-03-23T10:00:00Z",
      "blocked_by": [],
      "blocks": []
    }
  ],
  "total": 1
}
```

---

### Create Task

Create a new task.

```
POST /teams/{team_name}/tasks
```

**Request Body:**
```json
{
  "subject": "Implement login",
  "description": "Create user login functionality",
  "priority": "high",
  "assignee_id": "worker1",
  "blocked_by": ["task-id-1", "task-id-2"]
}
```

**Priority Options:** `low`, `medium`, `high`

---

### Get Task

Get a task by ID.

```
GET /teams/{team_name}/tasks/{task_id}
```

---

### Update Task

Update a task.

```
PATCH /teams/{team_name}/tasks/{task_id}
```

**Request Body:**
```json
{
  "subject": "New title",
  "description": "New description",
  "status": "in_progress",
  "priority": "high",
  "assignee_id": "worker2"
}
```

---

### Move Task

Move a task to a different status column (for Kanban drag-and-drop).

```
POST /teams/{team_name}/tasks/{task_id}/move
```

**Request Body:**
```json
{
  "status": "completed"
}
```

---

### Delete Task

Delete a task.

```
DELETE /teams/{team_name}/tasks/{task_id}
```

**Response:** `204 No Content`

---

## Agents API

### List Agents

List all agents in a team.

```
GET /teams/{team_name}/agents
```

**Response:**
```json
{
  "agents": [
    {
      "id": "agent-id",
      "team_id": "team-name",
      "name": "leader",
      "type": "leader",
      "status": "active",
      "cli": null,
      "backend": null,
      "current_task": null,
      "last_message": null,
      "inbox_count": 0,
      "spawned_at": "2026-03-23T10:00:00Z",
      "workspace": null
    },
    {
      "id": "pid-12345",
      "team_id": "team-name",
      "name": "worker1",
      "type": "general-purpose",
      "status": "active",
      "cli": "f",
      "backend": "tmux",
      "current_task": "Implement feature X",
      "last_message": null,
      "inbox_count": 2,
      "spawned_at": "2026-03-23T10:05:00Z",
      "workspace": "/path/to/workspace"
    }
  ],
  "total": 2
}
```

**Agent Status:** `active`, `idle`, `terminated`

---

### Spawn Agent

Spawn a new agent.

```
POST /teams/{team_name}/agents
```

**Request Body:**
```json
{
  "name": "worker1",
  "task": "Implement the login feature",
  "cli": "claude",
  "backend": "tmux",
  "workspace_enabled": true,
  "skip_permissions": true
}
```

**CLI Options:** `claude`, `codex`, `codeflicker`, `nanobot`, `gemini`
**Backend Options:** `tmux`, `subprocess`

---

### Get Agent

Get an agent by ID.

```
GET /teams/{team_name}/agents/{agent_id}
```

---

### Send Message to Agent

Send a message to an agent.

```
POST /teams/{team_name}/agents/{agent_id}/message
```

**Request Body:**
```json
{
  "content": "Please start working on task X"
}
```

---

### Terminate Agent

Terminate an agent.

```
POST /teams/{team_name}/agents/{agent_id}/terminate
```

---

## Messages API

### List Messages

List messages in a team's inbox.

```
GET /teams/{team_name}/messages
GET /teams/{team_name}/messages?agent=worker1
GET /teams/{team_name}/messages?unread_only=true
```

**Query Parameters:**
- `agent` (optional): Filter by agent name
- `unread_only` (optional): Only return unread messages

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-id",
      "team_id": "team-name",
      "from_agent": "worker1",
      "to_agent": "leader",
      "content": "Task completed!",
      "created_at": "2026-03-23T10:00:00Z",
      "read": false
    }
  ],
  "total": 1
}
```

---

### Send Message

Send a message to an agent.

```
POST /teams/{team_name}/messages
```

**Request Body:**
```json
{
  "to_agent": "worker1",
  "content": "Hello, please work on this task"
}
```

---

### Broadcast Message

Broadcast a message to all team members.

```
POST /teams/{team_name}/messages/broadcast
```

**Request Body:**
```json
{
  "content": "Team announcement: meeting at 3pm"
}
```

---

## SSE Events API

### Stream Events

Stream real-time events for a team via Server-Sent Events.

```
GET /teams/{team_name}/events
```

**Response:** `text/event-stream`

**Event Types:**
- `team_updated` - Team was created/updated/deleted
- `task_created` - New task created
- `task_updated` - Task was updated
- `task_moved` - Task moved to different status
- `task_deleted` - Task was deleted
- `agent_spawned` - New agent spawned
- `agent_status_changed` - Agent status changed
- `agent_terminated` - Agent terminated
- `agent_message` - Message sent/received

**Event Format:**
```json
{
  "type": "task_updated",
  "data": {
    "task_id": "task-id",
    "subject": "Task title",
    "status": "in_progress"
  },
  "timestamp": "2026-03-23T10:00:00Z"
}
```

---

## CLI Detection API

### List Available CLIs

List all supported AI CLI tools with installation status.

```
GET /clis
```

**Response:**
```json
{
  "clis": [
    {
      "command": "claude",
      "name": "Claude CLI",
      "vendor": "Anthropic",
      "installed": true,
      "version": "2.1.12"
    },
    {
      "command": "codex",
      "name": "Codex CLI",
      "vendor": "OpenAI",
      "installed": false,
      "version": null
    },
    {
      "command": "f",
      "name": "Codeflicker",
      "vendor": "Codeflicker",
      "installed": true,
      "version": "0.4.3"
    },
    {
      "command": "nanobot",
      "name": "Nanobot",
      "vendor": "HKUDS",
      "installed": false,
      "version": null
    },
    {
      "command": "gemini",
      "name": "Gemini CLI",
      "vendor": "Google",
      "installed": false,
      "version": null
    }
  ]
}
```

---

## Error Responses

All endpoints may return:

**400 Bad Request** - Invalid request data
```json
{
  "detail": "Error message describing the issue"
}
```

**404 Not Found** - Resource not found
```json
{
  "detail": "Team not found"
}
```

**500 Internal Server Error** - Server error
```json
{
  "detail": "Internal server error"
}
```

---

## Running the Server

```bash
cd /Users/likang/geminicode/agent/clawteam-web
source .venv/bin/activate
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs available at: http://localhost:8000/docs
