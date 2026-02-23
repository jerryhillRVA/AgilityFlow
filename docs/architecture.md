# Agility Flow — Architecture Reference

> A markdown-driven agentic platform where agent behavior is declared in structured `.md` files — not code. An orchestrator agent intelligently decomposes tasks, delegates to specialized sub-agents, tracks progress through an agile workflow, and communicates status in a way humans can follow and steer.

**Status Legend:**
- ✅ Implemented — built, tested, working in the MVP
- ⏳ Partial — some parts built, details noted
- 🔲 Not yet implemented — in the vision, not yet built

---

## 1. System Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Node — single Next.js process on :3000               │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │ Next.js Pages     ✅ │  │ API Routes + SSE          ✅ │ │
│  │ Sprint board, feed,  │  │ Task submission, agent       │ │
│  │ agent chat, dashboards│  │ execution, event streaming   │ │
│  └──────────┬───────────┘  └──────────────┬───────────────┘ │
│             └──── in-process function calls ───┘             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │ Orchestrator Agent ✅ │  │ Capability Registry       ✅ │ │
│  │ Decomposes, delegates │  │ Loaded from /definitions     │ │
│  │ in-process (no queue) │  │ at startup                   │ │
│  └──────────┬───────────┘  └──────────────────────────────┘ │
│             └── prompt assembly + tool routing ──┘           │
│  ┌────────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐ │
│  │Definitions✅│ │Prompt    ✅│ │Model     ✅│ │Tool       ✅│ │
│  │Local .md    │ │Assembler  │ │Adapter    │ │Router      │ │
│  │files        │ │           │ │Mock+Anthr.│ │            │ │
│  └────────────┘ └───────────┘ └───────────┘ └────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP to Agentic FS + MCP protocol
┌──────────────────────────┴──────────────────────────────────┐
│  External Dependencies                                       │
│  ┌────────────────────────────────┐  ┌────────────────────┐ │
│  │ Agentic Filesystem API (:8000) │  │ MCP Servers     🔲 │ │
│  │ Files + Search + RAG        ⏳ │  │ GitHub, DBs, etc.  │ │
│  │ (client built, service pending)│  │                    │ │
│  └────────────────────────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

- **Markdown as Code** — Agent behavior in `.md` files. New capabilities = new files. No imperative code needed to add agents, skills, or commands.
- **LLM as Runtime** — Models interpret definitions. Better models lead to smarter agents, automatically.
- **Provider Agnostic** — Swap models per agent in config. Test providers side by side. ⏳ Currently Anthropic + Mock only.
- **Minimal Dependencies** — One process. One external service. No queues, no databases, no caches.

### Architecture Layers

| # | Layer | Responsibility | Implemented As | Status |
|---|-------|---------------|----------------|--------|
| 1 | **Interface** | Sprint board, activity feed, agent proposals, chat. Accept tasks. Stream real-time activity via SSE. | Next.js pages + components | ✅ Core screens |
| 2 | **Orchestration** | Receive tasks, decompose, delegate to sub-agents, track agile status, escalate when needed. | `orchestrator.md` + orchestrator tools | ✅ Sequential delegation |
| 3 | **Definition** | Declare what agents can do — personas, skills, commands, templates. The "program." | Markdown files in `/definitions` (local, read-only) | ⏳ Agents + skills + templates done; commands + workflows not yet |
| 4 | **Execution** | Assemble prompts from definitions + context, call LLM providers, route tool calls, run the agent loop. | Prompt assembler, model adapters, tool router | ✅ Full loop working |
| 5 | **Data** | Persist runtime state: tasks, events, sprints, artifacts, agent memory, knowledge. Semantic search + RAG. | Agentic Filesystem API (external) | ⏳ Client built, service not yet connected |
| 6 | **Integration** | Connect to external systems — source control, CI/CD, databases, communication tools. | MCP servers + API tool wrappers | 🔲 |

### Data Flow: Task to Result

```
User submits task (UI or API)
  → Orchestrator analyzes + gathers context
    → Decomposes → delegates to sub-agent(s)
      → Prompt assembled (local .md + context)
        → LLM call via model adapter
          → Agent uses tools (Agentic FS, MCP, APIs)
            → Results + events persisted
              → UI updates via SSE
```

### What Goes Where

| Plane | Storage | Contents | Lifecycle |
|-------|---------|----------|-----------|
| **Definition Plane** (local FS) | Markdown files in `/definitions` + `/config` | Agent definitions, commands, skills, templates, context docs, model config, tool config | Deployed with codebase. Read-only at runtime. Versioned in Git. |
| **Data Plane** (Agentic FS) | External service at `:8000` | Sprint state, task records, agent events, work products, agent memory, project knowledge | Produced at runtime. Shared across nodes. Semantically searchable. |

---

## 2. UI & Screens

### Global Layout ✅

Three-column layout persists across all screens:

```
┌──────────────┬─────────────────────────────────┬──────────────────┐
│ LEFT SIDEBAR │       MAIN CONTENT AREA         │ AGENT WORKSPACE  │
│  (256px)     │       (flex-1)                  │    (320px)       │
│              │                                  │                  │
│ Navigation   │  Page header + actions           │ Active Proposals │
│ grouped by:  │                                  │                  │
│              │  ┌───────────────────────────┐   │ Activity Feed    │
│ Agent Mgmt   │  │                           │   │                  │
│ Work Mgmt    │  │  Screen-specific content  │   │ Ask Agent        │
│ SDLC         │  │                           │   │                  │
│ Ops          │  └───────────────────────────┘   │                  │
│              │                                  │                  │
│ Settings     │                                  │                  │
└──────────────┴─────────────────────────────────┴──────────────────┘
```

### Navigation & Organization

| Screen | Description | Status |
|--------|-------------|--------|
| **Portfolio** | Cross-project dashboard, resource allocation, velocity comparison | 🔲 |
| **Project Selector** | Switch between projects (maps to Agentic FS tenants) | 🔲 |
| **Context** | Project-scoped context: charter, conventions, tech stack. Stored in Agentic FS `knowledge/` namespace | 🔲 |
| **Settings** | Model provider API keys, default tiers, autonomy levels, MCP connections, Agentic FS endpoint | ✅ Display-only |

### Agent Management

| Screen | Description | Status |
|--------|-------------|--------|
| **Jobs** | Submit tasks to orchestrator. "Do Work" form with title, description, priority. Job history with status tracking. | ✅ Core flow |
| **Jobs — Run Tests** | Trigger test execution agents. Ticket-level, system, regression. View results inline. | 🔲 |
| **Jobs — Workflows** | Multi-step agent workflows. Sequential or parallel execution. Reusable templates. | 🔲 |
| **Agents** | Visual registry of all agents. Cards with name, role, model, skills, tools, status. | ✅ Registry view |
| **Agents — Detail** | View/edit agent `.md` definition, memory contents, execution stats, token usage | 🔲 |
| **Agents — Create** | Guided editor for new `agent.md` files | 🔲 |
| **Skills** | Library of all `skill.md` files. Preview content, see which agents use each skill. | 🔲 Sidebar link only |
| **Templates** | Pre-configured output templates. PR descriptions, sprint reports, test plans. | 🔲 Sidebar link only |
| **MCPs & Tools** | External tool connections, MCP servers, health checks. GitHub, Jira, Slack, databases. | 🔲 Sidebar link only |

### Work Management

| Screen | Description | Status |
|--------|-------------|--------|
| **Tickets** | Unified work item view. Issues (bugs, defects), Requests (features, changes). Table with search, filter, bulk actions. | 🔲 Sidebar link only |
| **Status Board** | Kanban board. Configurable columns (Backlog → To Do → In Progress → Review → Done → Blocked). | ✅ 6-column Kanban |
| **Epics** | Large initiatives broken into stories. Progress bar, completion %, timeline. | 🔲 Sidebar link only |
| **Stories** | User-facing requirements with acceptance criteria. "As a..., I want..., So that..." narrative. | 🔲 Sidebar link only |
| **Sprints** | Time-boxed iterations. Planning view, active board, burndown, retro support. | 🔲 Sidebar link only |
| **Backlog** | All tasks across all statuses in table view. Columns: ID, Title, Status, Priority, Agent, Updated. | ✅ Table view |

### Software Development Lifecycle (SDLC)

| Screen | Description | Status |
|--------|-------------|--------|
| **Project Management** | Sprint health KPIs: velocity, cycle time, lead time, throughput, WIP, escaped defects. Burndown + cumulative flow charts. | 🔲 Sidebar link only |
| **Product Owner** | Backlog prioritization, charter management, roadmap timeline, stakeholder communication drafts. | 🔲 Sidebar link only |
| **Functional Specs** | Agent-drafted feature requirements from stories. Linked to stories and AC. | 🔲 Sidebar link only |
| **Technical Design** | Design docs, decision log, ADR management. Agent-generated proposals from functional specs. | 🔲 Sidebar link only |
| **Architecture** | Diagrams, component registry, dependency maps. Agent-maintained consistency checks. | 🔲 Sidebar link only |
| **Documentation** | Auto-generated docs from code, specs, architecture. Staleness detection. | 🔲 Sidebar link only |
| **Testing** | Multi-level test management. Ticket-level, system, regression. Coverage metrics, flaky test detection. | 🔲 Sidebar link only |

### Infrastructure & Deployment (Ops)

| Screen | Description | Status |
|--------|-------------|--------|
| **CI/CD Pipeline** | Pipeline visualization, build history, deploy triggers. Agent-triggered on ticket completion. | 🔲 Sidebar link only |
| **Container Orchestration** | Docker status dashboard, resource usage, health checks, scaling controls. | 🔲 Sidebar link only |
| **Monitoring & Observability** | Application metrics, error rates, latency. Log aggregation. Agent-powered anomaly detection. | 🔲 Sidebar link only |
| **Environment Management** | Dev/staging/prod cards. Config diff, promotion workflow, secret rotation reminders. | 🔲 Sidebar link only |

### Agent Workspace (Persistent Sidebar)

Present on every screen, adapts content to current screen context.

| Tab | Description | Status |
|-----|-------------|--------|
| **Active Proposals** | Proactive suggestions from orchestrator. Type badge, impact indicator, confidence %, Apply/Ignore, reasoning. Stored in Agentic FS `sprints/{sprint}/proposals/`. | ⏳ Shows in-progress/todo tasks; no confidence scores or Apply/Ignore yet |
| **Activity Feed** | Live stream of agent actions. Tool calls, delegations, completions, status changes. Filterable by agent, event type. | ✅ SSE-powered, color-coded events, live indicator |
| **Ask Agent** | Chat input to orchestrator. RAG-powered answers with cited sources. Context-scoped per screen. | ⏳ Chat works; RAG fallback when Agentic FS unavailable |

### Global Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Global Search** | Top bar search across all Agentic FS namespaces. Hybrid search. | 🔲 |
| **Notifications** | Bell icon. Agent-generated alerts: blocked tasks, risk escalations, deploy failures. | 🔲 |
| **Tenant/Project Switcher** | Sidebar dropdown switches Agentic FS tenant context. | 🔲 |

---

## 3. Deployment & Scale

### MVP — Single Node ✅

```
Agent Node (:3000)                  Agentic FS (:8000)
┌─────────────────────────────┐    ┌───────────────────┐
│ Next.js UI                  │    │ Files + Search     │
│ API Routes                  │◄──►│ RAG                │
│ Orchestrator                │    └───────────────────┘
│ Agent Executor              │
│ Tool Router                 │
│ SSE (event streaming)       │
└─────────────────────────────┘
```

### Scaled — Sticky Routing 🔲

```
            Load Balancer (sticky sessions)
           ┌──────────┼──────────┐
           ▼          ▼          ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Node 1   │ │ Node 2   │ │ Node N   │
     │ UI + API │ │ UI + API │ │ UI + API │    Agentic FS (:8000)
     │ Orch.    │ │ Orch.    │ │ Orch.    │◄──► Files + Search + RAG
     │ Agents   │ │ Agents   │ │ Agents   │    (shared, tenant-scoped)
     │ SSE      │ │ SSE      │ │ SSE      │
     └──────────┘ └──────────┘ └──────────┘
```

### Why This Works Without a Queue

When a task arrives at a node, the orchestrator runs on **that node** and delegates to sub-agents as **async function calls within the same process**. All sub-agents run on the same node. Events stream back over the same SSE connection (local, not cross-network). Results are written to the Agentic FS (shared state).

**Sticky sessions** ensure a user's browser stays connected to the same node for the duration of a task. The SSE stream is local to the node. But the source of truth is always the Agentic FS — if you open the sprint board on Node 1 and an agent on Node 2 completed a task, you see it because the board reads from the Agentic FS, not node-local state.

**Future upgrade path:** Add Redis/BullMQ as a queue between orchestrator and executor if cross-node task distribution is needed. Agent definitions and Agentic FS integration don't change.

---

## 4. Agentic FS Integration

> Separate service, separate repo. We consume its REST API. It holds all persistent runtime data — the only state that survives if a node restarts.

**Client status:** ✅ Full HTTP client built (`src/lib/agentic-fs-client.ts`)
**Service status:** ⏳ Not yet connected (waiting for user to start service at `:8000`)

### API Surface

#### File Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/{tenant}/files` | Upload file + async index |
| GET | `/v1/{tenant}/files/{id}` | Download file |
| PUT | `/v1/{tenant}/files/{id}` | Replace file |
| DELETE | `/v1/{tenant}/files/{id}` | Delete file |
| POST | `/v1/{tenant}/files/{id}/link` | Link files |
| POST | `/v1/{tenant}/files/{id}/move` | Move file |
| POST | `/v1/{tenant}/files/batch` | Batch retrieve |

#### Search & RAG

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/{tenant}/search/semantic` | Vector search |
| POST | `/v1/{tenant}/search/hybrid` | Vector + BM25 combined |
| GET | `/v1/{tenant}/search/similar/{id}` | Find similar files |
| POST | `/v1/{tenant}/search/ask` | RAG answer with citations |
| GET | `/v1/{tenant}/search/status/{id}` | Indexing status |

#### Metadata & Directories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/{tenant}/files/{id}/meta` | Get file metadata |
| PATCH | `/v1/{tenant}/files/{id}/meta` | Update metadata |
| POST | `/v1/{tenant}/dirs` | Create directory |
| GET | `/v1/{tenant}/dirs/{path}` | List directory |
| DELETE | `/v1/{tenant}/dirs/{path}` | Delete directory |

### Data Model & Namespace Layout

> **Full reference:** [`docs/data-model.md`](data-model.md) — directory trees, entity schemas, naming conventions, initialization.
> **Code source of truth:** `src/lib/agentic/fs-paths.ts` — typed namespace constants and path builders.

**Scoping model:** Each project maps to its own Agentic FS tenant (project-per-tenant). A special `_registry` tenant holds org/portfolio/project hierarchy metadata. This keeps search/RAG results scoped to a single project.

**6 namespaces per project tenant:**

| Namespace | Purpose |
|-----------|---------|
| `tasks` | Work items organized by status (backlog, todo, in-progress, review, done, blocked) |
| `sprints` | Sprint metadata, sprint-scoped tasks, orchestrator proposals |
| `events` | Timestamped agent activity log |
| `artifacts` | Work products: PRs, code, docs, reviews, specs |
| `memory` | Per-agent persistent memory and decision history |
| `knowledge` | Shared project knowledge: architecture, conventions, charter, tech stack |

**Initialization:** `src/lib/agentic/fs-init.ts` provides idempotent functions to create the base directory skeleton for new projects, sprints, agent memory, and the registry tenant.

### What We Store

- Agile task records (sprint state, status, assignees)
- Agent events (tool calls, delegations, progress)
- Work products (PRs, code, docs, reviews)
- Agent memory (context, decisions, history)
- Project knowledge base (charter, conventions, tech stack)
- Orchestrator proposals (suggestions with confidence scores)
- Org/portfolio/project hierarchy (in `_registry` tenant)

---

## 5. Definition Layer

> Markdown files in the repo. Deployed with every node. Read-only at runtime. This is the "program" — behavior, commands, skills, templates.

### Definition Types

| Type | Directory | Count (MVP) | Count (Vision) | Status |
|------|-----------|-------------|-----------------|--------|
| Agents | `definitions/agents/` | 6 | 8+ | ⏳ |
| Commands | `definitions/commands/` | 0 | 8+ | 🔲 |
| Skills | `definitions/skills/` | 2 | 8+ | ⏳ |
| Templates | `definitions/templates/` | 2 | 7+ | ⏳ |
| Workflows | `definitions/workflows/` | 0 | 4+ | 🔲 |
| Context | `definitions/context/` | 1 | 2+ | ⏳ |

### Command Format 🔲

Commands are task-oriented definitions that compose skills, tools, and templates into executable procedures.

```yaml
---
name: create-pull-request
description: Create a well-structured PR with description and linked issues
version: 1.2.0
skills: [code-review, git-operations]
tools: [github, file-system, agentic-fs]
template: pr-description
model_preference: balanced
context:
  from_agentic_fs:
    - query: "PR standards and coding conventions"
      namespace: knowledge
      k: 3
parameters:
  branch: { type: string, required: true }
  issue_ids: { type: array, required: false }
---

# Create Pull Request

## Context
{{context:agentic_fs_results}}

## Steps
1. Fetch diff for `{{branch}}` via `github` tool
2. Apply **code-review** skill to analyze changes
3. Format using **pr-description** template
4. Create the PR via `github`
5. Store artifact in Agentic FS: artifacts/pull-requests/
```

### Skill Format ⏳

Reusable expertise blocks that agents leverage. Skills are versioned and composable.

```yaml
---
name: code-review
description: Analyze code for quality, security, and best practices
version: 2.0.0
tools: [file-system]
---

# Code Review Skill

Evaluate: Correctness, Security, Maintainability, Performance.
Rate each: Pass | Concern | Issue
Provide specific line references for any concerns.
```

**Implemented skills:** code-review, task-decomposition
**Planned skills:** api-design, database-modeling, test-writing, architecture-analysis, risk-assessment, story-splitting, invest-validation

### Agent Format ✅

Agents have personas, model bindings, skill/tool assignments, and optional memory configuration.

```yaml
---
name: backend-developer
description: Senior backend engineer
role: individual-contributor
model: anthropic/claude-sonnet-4-5-20250929
skills: [code-review, api-design, database-modeling, test-writing]
commands: [create-pull-request, implement-feature, fix-bug]
tools: [github, file-system, database, terminal, agentic-fs]
memory:
  namespace: memory
  path: agents/backend-developer/
  auto_load: true
  auto_save: true
---

# Backend Developer Agent

## Memory
{{memory:project-context}}

## Working Style
- Search Agentic FS for relevant prior work before starting
- Store artifacts in artifacts/ namespace when done
- Update memory with decisions for future tasks
```

**Implemented agents:** orchestrator, backend-developer, frontend-developer, code-reviewer, technical-writer, qa-analyst
**Planned agents:** devops-agent, product-owner-agent, architect-agent, docs-agent

**Note:** Template variable interpolation (`{{memory:...}}`, `{{context:agentic_fs_results}}`) and `context.from_agentic_fs` RAG resolution are not yet implemented. Agent memory auto-load/save requires the Agentic FS service.

### Template Format ⏳

Output format specifications that agents follow when producing results.

```yaml
---
name: pr-description
version: 1.0.0
---

Format your output exactly as:

## Summary
[1-2 sentences]

## Changes
- [Bulleted list]

## Motivation
[Why. Link issues: Closes #{{issue_id}}]

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing performed

## Breaking Changes
[List or "None"]
```

**Implemented templates:** pr-description, sprint-report
**Planned templates:** code-review-report, functional-spec, technical-design, test-plan, deploy-checklist

---

## 6. Runtime Engine

> TypeScript modules in `src/lib/agentic/`. Imported by API route handlers. Everything runs in-process.

### Request Flow ✅

```
Browser → :3000
  → /api/tasks route (POST)
    → Orchestrator analyzes task
      → Delegates to sub-agent (in-process)
        → Prompt Assembler: .md body + skills + context
          → Model Adapter → LLM call (or mock)
            → Tool Router handles tool_use blocks
              → Results + events → event bus
                → Stream to SSE clients
```

### Agent Execution Loop ✅

```typescript
async function executeAgent(agentName, task, context, onEvent):
  // 1. Load agent definition from registry
  agentDef = registry.getAgent(agentName)

  // 2. Assemble prompt (local .md + skills + project context)
  prompt = assembler.build(agentDef, task, context)

  // 3. Get model adapter (mock or anthropic)
  adapter = getAdapter(agentDef.model)

  // 4. Agent loop: prompt → model → tool calls → repeat
  messages = [{ role: "user", content: task }]

  while (iterations < 10):
    response = adapter.chat({ systemPrompt, messages, tools })

    for each content block in response:
      if text     → emit agent:thinking event
      if tool_use → execute tool, push result, emit agent:tool_call event
      if end_turn → emit agent:completed, return result

    messages.push(response, toolResults)
    iterations++
```

### Model Configuration ✅

```yaml
# config/models.yaml
default_provider: anthropic
tiers:
  fast:     { anthropic: claude-haiku-4-5-20251001,   openai: gpt-4o-mini,  google: gemini-2.0-flash }
  balanced: { anthropic: claude-sonnet-4-5-20250929, openai: gpt-4o,       google: gemini-2.5-pro   }
  advanced: { anthropic: claude-opus-4-6,            openai: o3,           google: gemini-2.5-pro   }
```

**Implemented adapters:** MockAdapter (for testing), AnthropicAdapter (for production)
**Planned adapters:** OpenAI, Google, Grok

The adapter factory (`src/lib/agentic/adapters/index.ts`) uses the `MODEL_ADAPTER` environment variable: when `MODEL_ADAPTER=anthropic`, uses AnthropicAdapter; when `MODEL_ADAPTER=mock` or unset, uses MockAdapter.

> **Token optimization:** See [Token_Context_Optimization.md](Token_Context_Optimization.md) for the ReWOO execution pattern, sequential batch wave architecture, prompt caching, and cost projections.

---

## 7. Orchestrator

> The team-lead agent. Runs in-process on the same node as the request. Delegates to sub-agents via async function calls — no queue, no IPC.

### Definition ✅

The orchestrator is itself an agent defined in `definitions/agents/orchestrator.md`. It uses the advanced tier (Claude Opus) and has access to delegation tools, Agentic FS tools, and the full agent registry.

### Orchestrator Tools

| Tool | Description | Status |
|------|-------------|--------|
| `delegate_to_agent` | Run a sub-agent in-process | ✅ |
| `create_subtask` | Create a child task | ✅ |
| `update_task_status` | Change task status | ✅ |
| `run_command` | Execute a command definition directly | 🔲 |
| `query_registry` | Discover available capabilities | 🔲 |
| `spawn_parallel` | Run multiple agents concurrently (`Promise.all`) | 🔲 |
| `request_human_input` | Escalate to human for decisions | 🔲 |
| `agentic_fs_search` | Vector/hybrid search in Agentic FS | ✅ (client ready) |
| `agentic_fs_write` | Persist data to Agentic FS | ✅ (client ready) |
| `agentic_fs_read` | Read files from Agentic FS | ✅ (client ready) |
| `agentic_fs_list` | List directory contents | ✅ (client ready) |

### Delegation Flow ✅

```
Task arrives
  → Orchestrator gathers context (Agentic FS search)
    → Routes based on complexity:

  SIMPLE (one skill, clear scope)
    → run_command() → result                              🔲

  MEDIUM (needs an agent persona)
    → delegate_to_agent() → agent runs in-process → result  ✅

  COMPLEX (parallel work)
    → spawn_parallel([agentA, agentB]) → Promise.all → synthesize  🔲
```

### Agile Process as Task Manager

There is no separate task queue. The agile process — sprint backlog, task statuses, assignments — lives in the Agentic FS and **is** the task management system. The orchestrator reads the sprint board to know what needs doing, delegates agents to do it, and updates task status as work progresses. The UI reflects this in real-time.

Currently, the MVP uses an in-memory `Map<string, Task>` for task storage. When the Agentic FS service is connected, tasks will be persisted to the `sprints/` namespace.

---

## 8. Agile & Observability

### Event System ✅

All agent activity is emitted as typed events through an in-process event bus.

**Event types:**
- `system:info` — System initialization, status messages
- `task:created` — New task submitted
- `task:updated` — Task status changed
- `agent:started` — Agent began working on a task
- `agent:thinking` — Agent processing (iteration N)
- `agent:tool_call` — Agent invoked a tool
- `agent:completed` — Agent finished a task
- `agent:error` — Agent encountered an error
- `orchestrator:delegated` — Orchestrator assigned work to a sub-agent
- `task:transition_action` — Transition-triggered agent action started/completed
- `task:subtask_cascade` — Subtasks cascaded to done when parent moved to done

**Dual-write pattern** (vision):
1. Persist to Agentic FS `events/` namespace (source of truth)
2. Push to connected SSE clients (real-time updates)

**Current implementation:** Events are buffered in-memory (last 200) and streamed to SSE clients. Agentic FS persistence will activate when the service is connected.

### UI Views

| View | Data Source | Update Mechanism | Status |
|------|------------|------------------|--------|
| Sprint Board | `/api/sprint` (in-memory tasks) | Polls every 3s | ✅ |
| Activity Feed | `/api/events` (SSE stream) | Real-time SSE | ✅ |
| Agent Proposals | `/api/tasks` (in-memory) | Polls every 5s | ⏳ Basic |
| Ask Agent | `/api/ask` (Agentic FS RAG) | Request/response | ⏳ Fallback when FS unavailable |

---

## 9. Project Structure

### Current MVP Structure ✅

```
agility-flow/
├── definitions/                          # agent behavior (markdown)
│   ├── agents/                           # ✅ 5 agents
│   │   ├── orchestrator.md
│   │   ├── backend-developer.md
│   │   ├── frontend-developer.md
│   │   ├── code-reviewer.md
│   │   ├── technical-writer.md
│   │   └── qa-analyst.md
│   ├── skills/                           # ✅ 2 skills
│   │   ├── code-review.md
│   │   └── task-decomposition.md
│   ├── templates/                        # ✅ 2 templates
│   │   ├── pr-description.md
│   │   └── sprint-report.md
│   └── context/                          # ✅ 1 context doc
│       └── project-conventions.md
│
├── config/                               # ✅ runtime config
│   ├── models.yaml                       # model tier mapping
│   ├── tools.yaml                        # built-in tool definitions
│   └── agentic-fs.yaml                   # Agentic FS endpoint
│
├── src/
│   ├── app/                              # ✅ Next.js App Router
│   │   ├── layout.tsx                    # three-column root layout
│   │   ├── page.tsx                      # dashboard
│   │   ├── agents/page.tsx               # agent registry
│   │   ├── jobs/page.tsx                 # task submission + history
│   │   ├── sprint/page.tsx               # kanban board
│   │   ├── backlog/page.tsx              # task table
│   │   ├── settings/page.tsx             # config display
│   │   ├── globals.css                   # dark theme
│   │   └── api/                          # ✅ 8 API routes
│   │       ├── health/route.ts
│   │       ├── tasks/route.ts
│   │       ├── agents/route.ts
│   │       ├── definitions/route.ts
│   │       ├── events/route.ts           # SSE stream
│   │       ├── commands/route.ts
│   │       ├── sprint/route.ts
│   │       ├── ask/route.ts              # RAG query
│   │       ├── tasks/[taskId]/status/route.ts  # task status transitions
│   │       └── artifacts/[fileId]/route.ts     # artifact content download
│   │
│   ├── components/                       # ✅ React components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx               # navigation
│   │   │   └── AgentWorkspace.tsx        # right sidebar
│   │   ├── agent/
│   │   │   ├── ActivityFeed.tsx          # SSE event stream
│   │   │   ├── AgentChat.tsx             # ask agent chat
│   │   │   ├── ProposalsPanel.tsx        # active proposals
│   │   │   └── TaskSubmitForm.tsx        # task form
│   │   └── board/
│   │       ├── SprintBoard.tsx           # kanban columns + swimlanes
│   │       ├── TaskCard.tsx              # task card (parent + subtask variants)
│   │       ├── TaskDetailPanel.tsx       # slide-over detail panel
│   │       ├── StatusTransitionButtons.tsx # transition buttons + subtask gate
│   │       └── ArtifactViewerModal.tsx   # artifact content viewer
│   │
│   ├── lib/
│   │   ├── agentic-fs-client.ts          # ✅ full Agentic FS HTTP client
│   │   └── agentic/                      # ✅ runtime core
│   │       ├── registry.ts               # definition loader
│   │       ├── prompt-assembler.ts       # prompt builder
│   │       ├── executor.ts               # agent loop
│   │       ├── orchestrator.ts           # task management + delegation
│   │       ├── adapters/
│   │       │   ├── model-adapter.ts      # interface
│   │       │   ├── mock.ts              # mock adapter
│   │       │   ├── anthropic.ts         # anthropic adapter
│   │       │   └── index.ts             # factory
│   │       ├── tools/
│   │       │   ├── tool-router.ts       # dispatch
│   │       │   ├── builtin-tools.ts     # schemas
│   │       │   └── agentic-fs-tool.ts   # FS tool handlers
│   │       └── events/
│   │           ├── emitter.ts           # event bus
│   │           └── types.ts             # event helpers
│   │
│   └── types/                            # ✅ TypeScript types
│       ├── agent.ts
│       ├── agentic-fs.ts
│       ├── task.ts
│       └── events.ts
│
├── docs/                                 # documentation
│   └── architecture.md                   # this file
├── .env.local                            # env vars
├── .nvmrc                                # node version (22)
├── package.json
└── tsconfig.json
```

### Full Vision Structure 🔲

The full architecture envisions additional directories and files:

```
definitions/
  ├── commands/                           # 🔲 8+ command definitions
  │   ├── create-pull-request.md
  │   ├── implement-feature.md
  │   ├── fix-bug.md
  │   ├── write-tests.md
  │   ├── generate-spec.md
  │   ├── draft-documentation.md
  │   ├── run-regression.md
  │   └── deploy-environment.md
  ├── workflows/                          # 🔲 4+ workflow definitions
  │   ├── sprint-planning.md
  │   ├── full-feature-delivery.md
  │   ├── bug-triage-and-fix.md
  │   └── release-cycle.md
  └── context/
      └── tech-stack.md                   # 🔲

src/app/
  ├── portfolio/page.tsx                  # 🔲
  ├── [projectId]/                        # 🔲 dynamic project scope
  │   ├── layout.tsx
  │   ├── agents/[agentId]/page.tsx       # 🔲 agent detail
  │   ├── jobs/[jobId]/page.tsx           # 🔲 job execution view
  │   ├── skills/page.tsx                 # 🔲 skill library
  │   ├── templates/page.tsx              # 🔲 template library
  │   ├── integrations/page.tsx           # 🔲 MCP connections
  │   ├── tickets/page.tsx                # 🔲 unified ticket table
  │   ├── status/page.tsx                 # 🔲 cross-sprint kanban
  │   ├── epics/page.tsx                  # 🔲 epic list
  │   ├── stories/[storyId]/page.tsx      # 🔲 story detail
  │   ├── sprints/page.tsx                # 🔲 sprint list
  │   ├── sdlc/                           # 🔲 all SDLC screens
  │   └── ops/                            # 🔲 all ops screens

config/
  └── workflows.yaml                      # 🔲 workflow defaults
```

---

## 10. Build Phases & Maturity

### Phase Summary

| Phase | Description | Estimated Lines | Status |
|-------|-------------|-----------------|--------|
| **1 — Core Loop** | Next.js scaffold, Agentic FS client, prompt assembler, model adapter, one end-to-end execution | ~500 | ✅ Complete |
| **2 — Definitions + Registry** | Load all `.md` files, skill/template composition, registry browsing screens | ~400 | ✅ Complete |
| **3 — Orchestrator + Jobs** | Orchestrator agent, `delegate_to_agent`, Jobs screen, live streaming | ~300 | ✅ Complete |
| **4 — Work Management** | Tickets, Epics, Stories, Sprints screens. Kanban drag-drop. Sprint planning. | ~1,500 | 🔲 Not started |
| **5 — SDLC** | PM dashboard, PO view, Specs, Design, Architecture, Docs, Testing | ~2,500 | 🔲 Not started |
| **6 — Ops + Portfolio** | CI/CD, containers, monitoring, environments. Portfolio dashboard. Multi-model adapters. | ~1,500 | 🔲 Not started |
| **7 — Scale + Polish** | Dockerfile, sticky-session load balancer, proposals refinement, notifications, global search | ~800 | 🔲 Not started |

### Current Maturity: MVP (Phases 1-3)

The core agentic loop is fully functional:
- Agents are defined in markdown and loaded at startup
- The orchestrator receives tasks, delegates to sub-agents, and tracks completion
- The model adapter pattern supports mock testing and live Anthropic calls
- The UI provides full visibility into agent activity with real-time SSE streaming
- All API endpoints are tested and working
- Chrome UI regression tests pass on all 6 pages

**To activate live mode:**
1. Set `MODEL_ADAPTER=anthropic` and `ANTHROPIC_API_KEY` in `.env.local` — adapter factory uses AnthropicAdapter
2. Start Agentic FS at `localhost:8000` — persistence, RAG, and search activate

### Estimated Total Code (Full Vision)

| Component | Type | Lines |
|-----------|------|-------|
| Definitions (agents, commands, skills, templates, workflows) | Markdown | 3,000-8,000 |
| Agentic core (registry, assembler, executor, orchestrator) | TypeScript | ~600 |
| Model adapters (4 providers) | TypeScript | ~250 |
| Tool router + MCP + Agentic FS tool | TypeScript | ~200 |
| Event emitter + SSE + types | TypeScript | ~200 |
| Agentic FS client | TypeScript | ~150 |
| API routes (~20 route files) | TypeScript | ~800 |
| Page components (~30 pages) | React/TSX | ~2,000 |
| UI components (~45 components) | React/TSX | ~5,000 |
| Shared components (~8 primitives) | React/TSX | ~800 |
| **Total code** | | **~10,000** |
| **Total definitions** | | **~3,000-8,000** |

---

## 11. Workflows

### Task Lifecycle Workflow ✅

Tasks follow a defined lifecycle through the Sprint Board. Each status transition can trigger automated agent actions.

```
┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────┐    ┌──────────┐
│ Backlog  │───►│  To Do   │───►│ In Progress │───►│  Review  │───►│   Done   │
│          │    │          │    │             │    │          │    │          │
│ Plan     │    │ Docs &   │    │ Implement   │    │ Subtask  │    │ Cascade  │
│ created  │    │ criteria │    │ & delegate  │    │ gate     │    │ subtasks │
└──────────┘    └──────────┘    └─────────────┘    └──────────┘    └──────────┘
                                       │
                                ┌──────┴──────┐
                                │  Blocked    │
                                └─────────────┘
```

### Status Transitions & Triggered Actions

| Transition | Trigger | Action | Agent |
|------------|---------|--------|-------|
| **Task Created → Backlog** | `POST /api/tasks` | Orchestrator runs in plan mode: decomposes task into subtasks with `create_subtask` (assigns agents via `assigned_agent`). Task stays in Backlog with subtasks and plan summary visible. | Orchestrator |
| **Backlog → To Do** | Manual (UI button) | Runs documentation generation: technical-writer agent creates acceptance criteria and requirements artifacts with `category: 'requirements'`. | Technical Writer |
| **To Do → In Progress** | Manual (UI button) | Runs implementation: moves subtasks to in-progress, delegates each to its `assignedAgent`. Developer agents create `category: 'implementation'` artifacts. QA creates `category: 'verification'` artifacts. Subtasks complete to Review. | Task-specific agents |
| **In Progress → Review** | Manual (UI button) | **Subtask gate**: blocked unless ALL subtasks are in `review` or `done`. Returns 400 with list of blocking subtasks if not ready. | None (validation only) |
| **Review → Done** | Manual (UI button) | **Cascade**: all subtasks in `review` are automatically moved to `done`. Events emitted for each cascaded subtask. | None (automated) |
| **Any → Blocked** | Manual (UI button) | No automated action. | None |

### Task-Specific Agent Assignment

Not all agents run for every task. The orchestrator analyzes the task during plan mode and assigns only relevant agents:

| Task Type | Agents Assigned |
|-----------|----------------|
| Testing task | `qa-analyst`, `technical-writer` |
| Frontend-only | `frontend-developer`, `technical-writer` |
| Backend-only | `backend-developer`, `technical-writer` |
| Full-stack | `backend-developer`, `frontend-developer`, `qa-analyst`, `technical-writer` |
| All tasks | `code-reviewer` (for review phase) |

### Artifact Categories

Artifacts are organized by category on task detail views:

| Category | Created By | Examples |
|----------|-----------|----------|
| `requirements` | Technical Writer | acceptance-criteria.md, requirements-summary.md |
| `implementation` | Backend/Frontend Developer | api-implementation.md, ui-implementation.md |
| `verification` | QA Analyst, Code Reviewer | test-cases.md, code-review-report.md |
| `other` | Any agent | Miscellaneous artifacts |

### Swimlane UI

The Sprint Board uses inline per-column swimlanes to display parent/subtask relationships:

- **Parent tasks** render at the top level in each column
- **Subtask count badge** shows how many subtasks a parent has, with a toggle chevron
- **Expanded view** renders subtasks indented below their parent, only showing subtasks matching that column's status
- **Subtask cards** are compact with a left accent border, showing assigned agent prominently
- Subtasks in different statuses appear in their respective columns independently

### Persistence

All task state is persisted to the Agentic FS:

| Data | Namespace | Path Pattern |
|------|-----------|-------------|
| Task records | `tasks` | `tasks/{status}/{taskId}.json` |
| Artifacts | `artifacts` | `artifacts/{path}/{filename}` |
| Events | `events` | `events/{timestamp}.json` |

Tasks are persisted on creation and updated on each status transition (file moved between status directories).
