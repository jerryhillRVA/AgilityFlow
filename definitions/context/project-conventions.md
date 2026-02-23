---
name: Project Conventions
description: Coding standards and conventions for Agility Flow
---

# Project Conventions

- TypeScript strict mode
- Next.js App Router with server components by default
- Tailwind CSS for styling
- All API responses use NextResponse.json()
- Error responses include { error: string, details?: unknown }
- File naming: kebab-case for files, PascalCase for components
- All async operations handle errors with try/catch
- Use native fetch (no axios)
- Prefer composition over inheritance
- Keep components focused and small

## Artifact Categories

All agent-produced artifacts must be tagged with a category via the `category` parameter on `agentic_fs_write`:

| Category | When Used | Examples |
|----------|-----------|---------|
| `requirements` | Backlog → To Do transition | Acceptance criteria, requirements summaries, specifications |
| `implementation` | To Do → In Progress transition | Code artifacts, API designs, data models, configurations |
| `verification` | To Do → In Progress transition | Test cases, test plans, code review reports |
| `other` | Any time | Notes, meeting summaries, miscellaneous docs |

## Transition-Triggered Workflow

**Parent task** status transitions trigger automatic agent actions:

| Parent Transition | Action |
|-----------|--------|
| **Backlog → To Do** | Technical Writer creates requirements and acceptance criteria artifacts |
| **To Do → In Progress** | Assigned agents execute subtasks (task-specific — only relevant agents run) |
| **In Progress → Review** | Blocked until all subtasks are Done |
| **Review → Done** | All non-done subtasks cascade to Done |

## Subtask Lifecycle

Subtasks have a simplified, agent-managed lifecycle independent from the parent task:

```
pending → in-progress → done
                ↓
             blocked (on error)
```

- **pending**: Created by orchestrator during planning, waiting to be executed
- **in-progress**: Agent is actively working on this subtask
- **done**: Agent completed work, artifacts produced
- **blocked**: Agent encountered an error (error message stored on task)

Subtask status changes are automatic — users cannot manually transition subtask status. Parent task transitions trigger agent execution, which manages subtask status internally.
