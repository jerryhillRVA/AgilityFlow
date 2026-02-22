# CLAUDE.md — Project Context for Claude Code

## Project Overview

Agility Flow is a markdown-driven agentic platform built with Next.js 16 (App Router, TypeScript, Tailwind CSS). Agent behavior is declared in `.md` files with YAML frontmatter in the `definitions/` directory. An orchestrator agent decomposes incoming tasks and delegates to specialized sub-agents, all running in-process on a single Node.js instance. The only external dependency is the Agentic Filesystem API (separate service at `:8000`) for persistence, search, and RAG.

**Current maturity:** MVP (Phases 1-3 of 7). The core agentic loop, 6 UI pages, and 8 API routes are fully functional. See `docs/architecture.md` for the full architecture reference with implementation status annotations.

## Key Conventions

- **TypeScript strict mode** — all files use TypeScript
- **Next.js App Router** — server components by default, `"use client"` only when needed (state, effects, browser APIs)
- **Tailwind CSS** — dark theme via CSS custom properties in `globals.css`; no CSS modules
- **File naming:** kebab-case for files (`agentic-fs-client.ts`), PascalCase for components (`SprintBoard.tsx`)
- **Native fetch** — no axios or other HTTP clients
- **async/await** with try/catch — no raw promises
- **Composition over inheritance** — no class hierarchies for components
- **Small, focused components** — each component does one thing
- **NextResponse.json()** for all API responses
- **Error format:** `{ error: string, details?: unknown }`

## Important Paths

| Path | Purpose |
|------|---------|
| `definitions/agents/*.md` | Agent persona definitions (5 agents) |
| `definitions/skills/*.md` | Reusable skill blocks (2 skills) |
| `definitions/templates/*.md` | Output format templates (2 templates) |
| `definitions/context/*.md` | Project context docs (1 doc) |
| `config/models.yaml` | Model tier mapping (fast/balanced/advanced per provider) |
| `config/tools.yaml` | Built-in tool schemas |
| `config/agentic-fs.yaml` | Agentic FS connection config |
| `src/lib/agentic/registry.ts` | Capability registry — loads all definitions at startup |
| `src/lib/agentic/orchestrator.ts` | Task management + delegation to sub-agents |
| `src/lib/agentic/executor.ts` | Core agent loop (prompt → model → tools → repeat) |
| `src/lib/agentic/prompt-assembler.ts` | Builds system prompt from agent def + skills + context |
| `src/lib/agentic/adapters/` | Model adapters: `mock.ts`, `anthropic.ts`, factory in `index.ts` |
| `src/lib/agentic/tools/` | Tool router, schemas, Agentic FS tool handlers |
| `src/lib/agentic/events/emitter.ts` | In-process event bus (pub/sub, 200-event buffer) |
| `src/lib/agentic/fs-paths.ts` | Namespace constants, path builders, base directory lists |
| `src/lib/agentic/fs-init.ts` | Idempotent initialization for project/sprint/agent/registry |
| `src/lib/agentic-fs-client.ts` | Full HTTP client for Agentic FS REST API |
| `src/types/` | Type definitions: `agent.ts`, `task.ts`, `events.ts`, `agentic-fs.ts` |
| `src/app/api/*/route.ts` | 8 API routes (health, tasks, agents, definitions, events, commands, sprint, ask) |
| `src/app/*/page.tsx` | 6 pages (dashboard, jobs, agents, sprint, backlog, settings) |
| `src/components/layout/Sidebar.tsx` | Full navigation structure with all route paths |
| `docs/architecture.md` | Complete architecture reference with status annotations |
| `docs/data-model.md` | Agentic FS data model: directory trees, schemas, naming conventions |

## Running the Project

```bash
# Node 22 required (pinned in .nvmrc)
nvm use

# Install and run
npm install
npm run dev      # dev server on :3000
npm run build    # production build with type checking
```

**Environment variables** in `.env.local`:
- `AGENTIC_FS_URL` — Agentic FS service URL (default `http://localhost:8000`)
- `AGENTIC_FS_TENANT` — tenant scope (default `default`)
- `ANTHROPIC_API_KEY` — empty = mock mode, set = live Anthropic calls

## Architecture Patterns

### Singleton Pattern
Core services use lazy-initialized singletons:
- `getRegistry()` → `CapabilityRegistry` (loads definitions once)
- `getOrchestrator()` → `Orchestrator` (wraps executor + task store)
- `getAgenticFSClient()` → `AgenticFSClient` (HTTP client)
- `eventBus` → `EventBus` (global event emitter)

### Adapter Factory
`createAdapter()` in `src/lib/agentic/adapters/index.ts` checks for `ANTHROPIC_API_KEY`:
- Key present → `AnthropicAdapter`
- Key absent → `MockAdapter`

### Markdown-as-Code Definitions
Agent/skill/template files in `definitions/` use YAML frontmatter parsed by `gray-matter`. The frontmatter schema is defined in `src/types/agent.ts` (interfaces: `AgentDefinition`, `SkillDefinition`, `CommandDefinition`, `TemplateDefinition`).

### In-Process Delegation
The orchestrator delegates to sub-agents via the `delegate_to_agent` tool, which calls `executor.execute()` directly — no message queues, no IPC, no external job system. All agents run on the same Node.js process.

### Agentic FS Data Model
Each project maps to its own Agentic FS tenant (project-per-tenant). A `_registry` tenant holds org/portfolio/project hierarchy. 6 namespaces per project: tasks, sprints, events, artifacts, memory, knowledge. All path construction uses typed builders in `src/lib/agentic/fs-paths.ts`. Initialization functions in `src/lib/agentic/fs-init.ts`. Full reference: `docs/data-model.md`.

### SSE for Real-Time Events
The `/api/events` route uses Server-Sent Events (not WebSocket) to stream agent activity to the browser. The `ActivityFeed` component subscribes via `EventSource`. Events are buffered in the `EventBus` (last 200) so late-joining clients get recent history.

### Task Lifecycle
```
POST /api/tasks → orchestrator.submitTask()
  → creates Task (in-memory Map)
  → emits task:created event
  → runs orchestrator agent async (does not block response)
    → orchestrator uses delegate_to_agent tool
      → sub-agent runs executor.execute()
        → emits agent:started, agent:thinking, agent:tool_call, agent:completed
      → orchestrator updates task status to "done"
        → emits task:updated event
```

## Definition Frontmatter Schema

### Agent
```yaml
name: string          # unique identifier
description: string   # one-line description
role: string          # orchestrator | developer | reviewer | writer
model_tier: string    # fast | balanced | advanced
skills: string[]      # skill names to inject into prompt
tools: string[]       # allowed tool names
delegatesTo: string[] # (orchestrator only) sub-agent names
```

### Skill
```yaml
name: string
description: string
version: string
```

### Template
```yaml
name: string
version: string
```

The markdown body below the frontmatter becomes the agent's system prompt instructions (for agents) or injected content (for skills/templates).

## Guardrails

- **Do not add databases** — Agentic FS is the only persistence layer
- **Do not add message queues** — in-process delegation is the architecture choice
- **Keep the single-process model** — all agents run on the same Node.js process
- **Do not change frontmatter schema** without updating the corresponding types in `src/types/agent.ts` and the registry parser in `src/lib/agentic/registry.ts`
- **Agentic FS is the only external dependency** — do not add Redis, Postgres, etc.
- **SSE over WebSocket** — the current implementation uses SSE; if switching to WebSocket, update both `events/route.ts` and `ActivityFeed.tsx`
- **Mock adapter must stay functional** — it's the default development mode and must simulate realistic orchestrator behavior (delegation + completion)
