# Agility Flow

**Markdown-driven agentic platform**

Agility Flow is a platform where agent behavior is declared in structured `.md` files — not code. An orchestrator agent intelligently decomposes tasks, delegates to specialized sub-agents, and tracks progress through an agile workflow. The system streams real-time visibility to a human-facing UI so users can follow, steer, and collaborate with their AI agent team.

---

## Architecture Overview

The system is organized into six layers:

| Layer | Purpose | Implementation |
|-------|---------|----------------|
| **Interface** | Sprint board, activity feed, agent chat, dashboards | Next.js pages + React components |
| **Orchestration** | Task decomposition, delegation, agile status tracking | `orchestrator.md` + orchestrator tools |
| **Definition** | Agent personas, skills, commands, templates — the "program" | Markdown files in `/definitions` |
| **Execution** | Prompt assembly, LLM calls, tool routing, agent loop | TypeScript runtime in `src/lib/agentic/` |
| **Data** | Persistent state: tasks, events, artifacts, memory, knowledge | Agentic Filesystem API (`:8000`) |
| **Integration** | External systems: source control, CI/CD, databases | MCP servers + API wrappers |

**Design principles:** Markdown as Code, LLM as Runtime, Provider Agnostic, Minimal Dependencies.

For the complete architecture reference, see [docs/architecture.md](docs/architecture.md).

---

## Quick Start

### Prerequisites

- **Node.js 22** via [NVM](https://github.com/nvm-sh/nvm) (the `.nvmrc` file pins the version)
- **npm** (included with Node.js)

### Install & Run

```bash
# Use the correct Node version
nvm use

# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local  # or create manually (see Configuration below)

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file:

```env
AGENTIC_FS_URL=http://localhost:8000
AGENTIC_FS_TENANT=default
MODEL_ADAPTER=anthropic                   # anthropic | openai | mock
AGENT_CLI=                                # optional: auto | claude | codex (empty = auto)
AGENT_CLI_PATH=                           # optional absolute path to codex/claude binary
CODEX_SANDBOX_MODE=workspace-write        # read-only | workspace-write | danger-full-access
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=                          # optional, for OpenAI-compatible providers
JIRA_BASE_URL=                            # optional, for Jira MCP (e.g. https://your-org.atlassian.net)
JIRA_EMAIL=                               # optional, Jira account email
JIRA_API_TOKEN=                           # optional, Jira API token
```

- **`MODEL_ADAPTER=mock`**: Uses the mock adapter for UI development/testing.
- **`MODEL_ADAPTER=anthropic`**: Uses Anthropic models via `ANTHROPIC_API_KEY`.
- **`MODEL_ADAPTER=openai`**: Uses the OpenAI SDK via `OPENAI_API_KEY` and optional `OPENAI_BASE_URL`, with automatic endpoint routing between Responses API and Chat Completions.
- **`AGENT_CLI`**: Optional override for implementation/test CLI (`claude` or `codex`). Empty uses auto-selection.
- **`CODEX_SANDBOX_MODE`**: Sandbox mode passed to `codex exec --sandbox`.
- **Model IDs are configurable**: Set per-tier model names in `config/models.yaml` (or per-agent `model:` overrides) to use provider-specific model IDs.
- **With Agentic FS running**: Persistence, RAG, and semantic search activate. Without it, the system runs with in-memory task storage.

### Run Tests Prerequisites

The ticket-level **Run Tests** flow uses browser MCP automation. The required browser setup depends on the CLI selected by `AGENT_CLI`:

- **Codex (`AGENT_CLI=codex`, or auto-selected with `MODEL_ADAPTER=openai`)**: Register the Chrome DevTools MCP server in Codex before running tests.

```bash
codex mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
codex mcp list
```

- **Claude (`AGENT_CLI=claude`)**: Install the Claude Desktop **Control Chrome** extension. The test runner expects the local server at:

```text
~/Library/Application Support/Claude/Claude Extensions/ant.dir.ant.anthropic.chrome-control/server/index.js
```

- After adding or changing MCP configuration, restart the Agility Flow dev server before using **Run Tests**.
- The current built-in browser automation path is Chrome-based. If the required MCP server is missing, test execution will not be able to complete browser-driven checks.

---

## Project Structure

```
agility-flow/
├── definitions/                   # Agent behavior (markdown)
│   ├── agents/                    #   5 agent personas
│   ├── skills/                    #   2 reusable skill blocks
│   ├── templates/                 #   2 output format templates
│   └── context/                   #   1 project conventions doc
├── config/                        # Runtime configuration
│   ├── models.yaml                #   Model tier mapping (fast/balanced/advanced)
│   ├── tools.yaml                 #   Built-in tool definitions
│   └── agentic-fs.yaml            #   Agentic FS connection config
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── api/                   #   8 API routes
│   │   └── {page}/page.tsx        #   6 pages
│   ├── components/                # React components
│   │   ├── layout/                #   Sidebar, AgentWorkspace
│   │   ├── agent/                 #   ActivityFeed, AgentChat, Proposals, TaskForm
│   │   └── board/                 #   SprintBoard, TaskCard
│   ├── lib/
│   │   ├── agentic-fs-client.ts   # Agentic FS HTTP client
│   │   └── agentic/               # Runtime core
│   │       ├── registry.ts        #   Definition loader
│   │       ├── prompt-assembler.ts#   Prompt builder
│   │       ├── executor.ts        #   Agent loop
│   │       ├── orchestrator.ts    #   Task management + delegation
│   │       ├── fs-paths.ts        #   Namespace constants + path builders
│   │       ├── fs-init.ts         #   Project/sprint/agent initialization
│   │       ├── adapters/          #   Model adapters (mock, anthropic)
│   │       ├── tools/             #   Tool router + handlers
│   │       └── events/            #   Event bus + SSE
│   └── types/                     # TypeScript type definitions
├── docs/                          # Documentation
│   ├── architecture.md            #   Full architecture reference
│   └── data-model.md              #   Agentic FS data model reference
└── .env.local                     # Environment variables
```

---

## Key Concepts

### Markdown Definitions

Agent behavior is declared in `.md` files with YAML frontmatter. The system loads these at startup via the **Capability Registry**, which parses the frontmatter with `gray-matter` and stores definitions in typed in-memory Maps.

```yaml
---
name: backend-developer
description: Senior backend engineer
role: developer
model_tier: balanced
skills: [code-review, api-design]
tools: [agentic_fs_read, agentic_fs_write, agentic_fs_search]
---

# Backend Developer Agent
## Working Style
- Search for relevant prior work before starting
- Store artifacts when done
```

### Orchestrator Delegation

When a task is submitted, the orchestrator agent analyzes it and delegates to the appropriate sub-agent. Delegation happens as async function calls within the same Node.js process — no message queues or IPC needed. The orchestrator has tools: `delegate_to_agent`, `create_subtask`, `update_task_status`.

### Model Adapters

A factory pattern selects the adapter based on environment configuration:
- **MockAdapter** — Returns simulated responses with realistic tool calls.
- **AnthropicAdapter** — Uses `@anthropic-ai/sdk` for Claude API calls (`MODEL_ADAPTER=anthropic`).
- **OpenAIAdapter** — Uses `openai` SDK with automatic endpoint routing (`MODEL_ADAPTER=openai`, optional `OPENAI_BASE_URL`).

### Agentic Filesystem

An external REST API service (separate repo) that provides tenant-scoped file storage, semantic search, hybrid search, and RAG. It serves as the single source of truth for all persistent runtime data: tasks, events, sprints, artifacts, agent memory, and project knowledge. Each project maps to its own Agentic FS tenant for search isolation. See [`docs/data-model.md`](docs/data-model.md) for the full directory tree, entity schemas, and naming conventions.

### Event Bus & SSE

All agent activity flows through an in-process event bus. Events are buffered (last 200) and streamed to browser clients via Server-Sent Events (SSE). The Activity Feed in the Agent Workspace sidebar displays these events in real-time with color-coded type badges.

---

## Current Status

**Maturity: MVP (Phases 1-3 of 7 complete)**

| Area | Implemented | Vision |
|------|------------|--------|
| Agents | 5 (orchestrator, backend-dev, frontend-dev, code-reviewer, technical-writer) | 8+ |
| Skills | 2 (code-review, task-decomposition) | 8+ |
| Commands | 0 | 8+ |
| Templates | 2 (pr-description, sprint-report) | 7+ |
| Workflows | 0 | 4+ |
| API Routes | 8 | ~20 |
| Pages | 6 (Dashboard, Jobs, Agents, Sprint Board, Backlog, Settings) | ~30 |
| Model Adapters | 2 (Mock, Anthropic) | 4+ (+ OpenAI, Google, Grok) |
| UI Components | 8 | ~45 |

**What works end-to-end:**
- Submit a task via the UI or API
- Orchestrator analyzes and delegates to a sub-agent
- Sub-agent executes (mock or live) and returns results
- Events stream in real-time to the Activity Feed
- Tasks appear on the Sprint Board and Backlog
- Agent registry displays all loaded definitions

**What's pending:**
- Anthropic API key (for live LLM responses)
- Agentic FS service (for persistence, RAG, search)
- SDLC, Ops, and Work Management detail screens
- Commands and workflows
- Multi-tenant/multi-project support

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTIC_FS_URL` | No | Agentic FS service URL (default: `http://localhost:8000`) |
| `AGENTIC_FS_TENANT` | No | Tenant scope for Agentic FS (default: `default`) |
| `MODEL_ADAPTER` | No | Adapter selector: `anthropic`, `openai`, or `mock` (default: `mock`) |
| `ANTHROPIC_API_KEY` | No | Anthropic API key when `MODEL_ADAPTER=anthropic`. |
| `OPENAI_API_KEY` | No | API key when `MODEL_ADAPTER=openai`. |
| `OPENAI_BASE_URL` | No | Optional base URL for OpenAI-compatible APIs. |
| `LOG_LEVEL` | No | Log verbosity: `debug`, `info`, `warn`, `error` (default: `debug` in dev, `info` in prod) |
| `LOG_FILE` | No | When set, tee log output to this file in addition to stdout/stderr (e.g. `server.log`) |

### Config Files

| File | Purpose |
|------|---------|
| `config/models.yaml` | Model tier definitions — maps fast/balanced/advanced to specific model IDs per provider |
| `config/tools.yaml` | Built-in tool schemas (7 tools: agentic_fs_read/write/search/list, delegate_to_agent, create_subtask, update_task_status) |
| `config/agentic-fs.yaml` | Agentic FS base URL, tenant, and namespace mapping |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | App status, Agentic FS connectivity, adapter type |
| POST | `/api/tasks` | Submit a task to the orchestrator (async execution) |
| GET | `/api/tasks` | List all tasks with status |
| GET | `/api/agents` | List all agent definitions from the registry |
| GET | `/api/definitions?type=` | Filter definitions by type: agents, skills, commands, templates |
| GET | `/api/events` | SSE stream of agent activity events |
| GET | `/api/sprint` | Sprint board data (tasks grouped by status columns) |
| POST | `/api/ask` | RAG query to Agentic FS with fallback |
| GET | `/api/commands` | List command definitions |

---

## Tech Stack

| Dependency | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.6 | React framework with App Router |
| React | 19.2.3 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Utility-first CSS (dark theme) |
| `@anthropic-ai/sdk` | 0.78.x | Anthropic Claude API client |
| `openai` | 6.x | OpenAI/OpenAI-compatible Chat Completions client |
| `gray-matter` | 4.0.x | YAML frontmatter parsing from markdown |
| `yaml` | 2.8.x | Config file parsing |
| `lucide-react` | 0.575.x | Icon library |
| `uuid` | 13.x | UUID generation for task/event IDs |

---

## Next Steps

1. **Go live with an LLM provider** — Set `MODEL_ADAPTER` to `anthropic` or `openai` and provide the corresponding API key in `.env.local`.
2. **Connect Agentic FS** — Start the Agentic FS service at `localhost:8000`. Persistence, RAG, and search will activate.
3. **Phase 4: Work Management** — Tickets, Epics, Stories, Sprints with full CRUD backed by Agentic FS.
4. **Phase 5: SDLC** — PM dashboards, specs, design docs, architecture, documentation, testing screens.
5. **Phase 6: Ops + Portfolio** — CI/CD, containers, monitoring, environments, cross-project dashboard.
6. **Phase 7: Scale + Polish** — Docker deployment, notifications, global search, proposals refinement.

---

## Development

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Production build with type checking
npm run start    # Start production server
npm run lint     # Run ESLint
```

**Node version:** This project requires Node.js 22. Use `nvm use` to activate the correct version from `.nvmrc`.

### Debug Logging

```bash
# Start with full debug logging to file + terminal
LOG_LEVEL=debug LOG_FILE=server.log npm run dev

# Trace a specific task through the entire pipeline
grep trace:<id> server.log
```

All log output streams to both the launch terminal (stdout/stderr) and the log file simultaneously — the file is an additional copy, not a replacement. Every API request generates a trace ID that propagates through the full agent execution pipeline, making it easy to follow a single task from submission to completion.
