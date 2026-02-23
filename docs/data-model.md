# Agility Flow — Agentic Filesystem Data Model

> Authoritative reference for the folder structure, path conventions, and entity schemas used by the Agentic Filesystem API. All path construction in code must use the typed builders in `src/lib/agentic/fs-paths.ts`.

---

## 1. Tenant Model

Each **project** maps to its own Agentic FS **tenant**. This keeps search results, RAG context, and file paths scoped to a single project — critical for result quality.

A special `_registry` tenant holds the organizational hierarchy (orgs, portfolios, projects) that spans across project tenants.

```
Agentic FS Instance
├── _registry/                    # hierarchy metadata tenant
│   └── knowledge/
│       ├── orgs/
│       ├── portfolios/
│       └── projects/
│
├── acme-webapp/                  # tenant = project slug
│   ├── tasks/
│   ├── sprints/
│   ├── events/
│   ├── artifacts/
│   ├── memory/
│   └── knowledge/
│
└── acme-mobile/                  # another project tenant
    ├── tasks/
    ├── sprints/
    └── ...
```

**Tenant naming:** kebab-case project slug (e.g., `acme-webapp`, `mobile-app-v2`). The default tenant for local development is `default`.

**URL pattern:** `{baseUrl}/v1/{tenant}{path}`

---

## 2. Namespaces

Every project tenant contains 6 namespaces. These are the top-level organizational units within a tenant.

| Namespace | Purpose | Contents |
|-----------|---------|----------|
| `tasks` | Work items organized by status | Task JSON files in status subdirectories |
| `sprints` | Time-boxed iterations | Sprint metadata, sprint-scoped tasks, proposals |
| `events` | Agent activity log | Timestamped event records |
| `artifacts` | Work products | Code, PRs, docs, reviews, specs |
| `memory` | Agent persistent memory | Per-agent context and decision history |
| `knowledge` | Shared project knowledge | Architecture, conventions, charter, tech stack |

Namespace names are defined as constants in `src/lib/agentic/fs-paths.ts` (`NS.TASKS`, `NS.SPRINTS`, etc.).

---

## 3. Project Tenant Directory Tree

```
{tenant}/
│
├── tasks/                              # NS.TASKS
│   ├── pending/                        # subtask-only status
│   │   └── {taskId}.json
│   ├── backlog/
│   │   └── {taskId}.json
│   ├── todo/
│   │   └── {taskId}.json
│   ├── in-progress/
│   │   └── {taskId}.json
│   ├── review/
│   │   └── {taskId}.json
│   ├── done/
│   │   └── {taskId}.json
│   └── blocked/
│       └── {taskId}.json
│
├── sprints/                            # NS.SPRINTS
│   └── {sprintId}/
│       ├── sprint-meta.json
│       ├── tasks/
│       │   └── {taskId}.json
│       └── proposals/
│           └── {proposalId}.json
│
├── events/                             # NS.EVENTS
│   └── {YYYY-MM-DD}/
│       └── {eventId}.json
│
├── artifacts/                          # NS.ARTIFACTS — task-scoped
│   └── {taskId}/                       # one dir per task/subtask
│       ├── requirements/
│       │   └── {filename}
│       ├── implementation/
│       │   └── {filename}
│       ├── verification/
│       │   └── {filename}
│       └── other/
│           └── {filename}
│
├── memory/                             # NS.MEMORY
│   └── agents/
│       └── {agentName}/
│           └── {memoryFile}.md
│
└── knowledge/                          # NS.KNOWLEDGE
    ├── architecture/
    │   └── {filename}
    ├── conventions/
    │   └── {filename}
    ├── charter/
    │   └── {filename}
    └── tech-stack/
        └── {filename}
```

---

## 4. Registry Tenant Directory Tree

The `_registry` tenant stores organizational hierarchy metadata. It uses the `knowledge` namespace.

```
_registry/
└── knowledge/                          # NS.KNOWLEDGE
    ├── orgs/
    │   └── {orgId}.json
    ├── portfolios/
    │   └── {portfolioId}.json
    └── projects/
        └── {projectId}.json
```

---

## 5. Entity Schemas

### 5.1 Task

Stored at: `tasks/{status}/{taskId}.json`

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "pending | backlog | todo | in-progress | review | done | blocked",
  "priority": "critical | high | medium | low",
  "assignedAgent": "string?",
  "parentTaskId": "string?",
  "subtaskIds": ["string"],
  "sprintId": "string?",
  "tags": ["string"],
  "fileId": "string?",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**Tags:** `['task', '{priority}']`
**Path convention:** When a task's status changes, it should be moved to the new status directory via the `moveFile` API.

### 5.2 Sprint

Stored at: `sprints/{sprintId}/sprint-meta.json`

```json
{
  "id": "string",
  "name": "string",
  "goal": "string",
  "status": "planning | active | review | completed",
  "taskIds": ["string"],
  "startDate": "ISO 8601?",
  "endDate": "ISO 8601?"
}
```

### 5.3 Event

Stored at: `events/{YYYY-MM-DD}/{eventId}.json`

```json
{
  "id": "string",
  "type": "system:info | task:created | task:updated | agent:started | agent:thinking | agent:tool_call | agent:completed | agent:error | orchestrator:delegated",
  "message": "string",
  "data": {},
  "agentId": "string?",
  "taskId": "string?",
  "timestamp": "ISO 8601"
}
```

### 5.4 Proposal

Stored at: `sprints/{sprintId}/proposals/{proposalId}.json`

```json
{
  "id": "string",
  "type": "optimization | risk | refactor | feature",
  "title": "string",
  "description": "string",
  "confidence": 0.0-1.0,
  "impact": "low | medium | high",
  "status": "pending | accepted | dismissed",
  "createdAt": "ISO 8601"
}
```

### 5.5 Org (Registry)

Stored at: `_registry` tenant, `knowledge/orgs/{orgId}.json`

```json
{
  "id": "string",
  "name": "string",
  "portfolioIds": ["string"],
  "createdAt": "ISO 8601"
}
```

### 5.6 Portfolio (Registry)

Stored at: `_registry` tenant, `knowledge/portfolios/{portfolioId}.json`

```json
{
  "id": "string",
  "name": "string",
  "orgId": "string",
  "projectIds": ["string"],
  "createdAt": "ISO 8601"
}
```

### 5.7 Project (Registry)

Stored at: `_registry` tenant, `knowledge/projects/{projectId}.json`

```json
{
  "id": "string",
  "name": "string",
  "portfolioId": "string",
  "tenant": "string",
  "status": "active | archived",
  "createdAt": "ISO 8601"
}
```

---

## 6. Naming Conventions

| Element | Convention | Examples |
|---------|-----------|----------|
| Tenant names | kebab-case project slug | `acme-webapp`, `mobile-app-v2`, `default` |
| Namespace names | lowercase plural | `tasks`, `sprints`, `events`, `artifacts`, `memory`, `knowledge` |
| Directory paths | kebab-case | `pull-requests`, `in-progress`, `tech-stack` |
| Entity files | `{id}.json` | `550e8400-e29b-41d4-a716-446655440000.json` |
| Document files | `{name}.md` | `project-context.md`, `decisions.md` |
| Tags | lowercase, hyphenated | `task`, `high-priority`, `sprint-24` |
| Date directories | `YYYY-MM-DD` | `2026-02-22` |
| Agent memory dirs | `agents/{agent-name}/` | `agents/orchestrator/`, `agents/backend-developer/` |

---

## 7. Initialization

When a new scope is created, base directories must be initialized. The functions in `src/lib/agentic/fs-init.ts` handle this:

| Function | Scope | Creates |
|----------|-------|---------|
| `initializeProject()` | Project tenant | All 16 base directories (task status dirs, artifact type dirs, memory/agents, knowledge categories) |
| `initializeSprint()` | Sprint within project | Sprint dir, tasks subdir, proposals subdir, sprint-meta.json |
| `initializeAgentMemory()` | Agent within project | `memory/agents/{agentName}/` directory |
| `initializeRegistry()` | Registry tenant | `orgs/`, `portfolios/`, `projects/` dirs in knowledge namespace |

All initialization functions are idempotent — safe to call multiple times.

---

## 8. Path Builders

All path construction in application code uses the typed builders in `src/lib/agentic/fs-paths.ts`. Direct string construction of paths is not allowed outside that file.

| Builder | Returns | Example |
|---------|---------|---------|
| `paths.tasks.dir(status)` | Status directory path | `"todo"`, `"in-progress"` |
| `paths.tasks.file(status, taskId)` | Task file path | `"todo/abc-123.json"` |
| `paths.sprints.meta(sprintId)` | Sprint metadata path | `"sprint-24/sprint-meta.json"` |
| `paths.sprints.taskFile(sprintId, taskId)` | Sprint task path | `"sprint-24/tasks/abc-123.json"` |
| `paths.sprints.proposals(sprintId)` | Proposals directory | `"sprint-24/proposals"` |
| `paths.events.file(date, eventId)` | Event file path | `"2026-02-22/evt-001.json"` |
| `paths.artifacts.taskDir(taskId)` | Task artifact root | `"abc-123"` |
| `paths.artifacts.taskCategoryDir(taskId, cat)` | Category dir | `"abc-123/requirements"` |
| `paths.artifacts.file(taskId, cat, file)` | Artifact file path | `"abc-123/requirements/criteria.md"` |
| `paths.memory.agentDir(name)` | Agent memory directory | `"agents/orchestrator"` |
| `paths.memory.agentFile(name, file)` | Agent memory file | `"agents/orchestrator/decisions.md"` |
| `paths.knowledge.file(category, file)` | Knowledge file path | `"conventions/coding-standards.md"` |
| `paths.registry.org(orgId)` | Registry org path | `"orgs/acme-corp.json"` |
| `paths.registry.portfolio(id)` | Registry portfolio path | `"portfolios/web-apps.json"` |
| `paths.registry.project(id)` | Registry project path | `"projects/acme-webapp.json"` |
