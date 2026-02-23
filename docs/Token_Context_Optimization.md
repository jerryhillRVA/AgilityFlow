# Token & Context Optimization Architecture

## Problem Statement

The original orchestrator-to-sub-agent pipeline consumed ~55,000 tokens and ~$0.46 per 4-subtask execution. Each sub-agent ran a multi-iteration ReAct loop (prompt → model → tool call → tool result → repeat), re-sending the full system prompt and growing conversation history every iteration. Most token spend was redundant context re-transmission.

## Solution: ReWOO Single-Shot + Sequential Waves + Prompt Caching

### ReWOO Pattern

Instead of iterative tool-calling loops, sub-agents receive all necessary context upfront and produce all artifacts in a single LLM call. This is the "Reasoning WithOut Observations" (ReWOO) pattern adapted for artifact generation.

**How it works:**
1. The **context builder** (`src/lib/agentic/context-builder.ts`) pre-fetches all relevant artifacts and RAG context before the agent runs
2. The **prompt assembler** (`src/lib/agentic/prompt-assembler.ts`) builds a ReWOO prompt with artifact delimiter instructions (no tools)
3. The agent produces all artifacts in a single response using `<<<ARTIFACT>>>` delimiters
4. The **artifact parser** (`src/lib/agentic/artifact-parser.ts`) extracts artifacts from the response
5. Artifacts are written to Agentic FS via the task-scoped tool router

**Artifact delimiter format:**
```
<<<ARTIFACT filename="acceptance-criteria.md" category="requirements">>>
[artifact content here]
<<<END_ARTIFACT>>>
```

### Sequential Batch Waves

The **wave executor** (`src/lib/agentic/wave-executor.ts`) runs subtasks in ordered waves based on `executionOrder`:

```
Wave 1: technical-writer (produces requirements docs)
    ↓ (context forwarded)
Wave 2: qa-analyst, backend-developer (each sees wave 1 artifacts)
    ↓ (context forwarded)
Wave 3: code-reviewer (sees all prior artifacts)
```

Within each wave, agents run **sequentially** so each can see the prior agent's output. This ensures context flows correctly without parallel coordination overhead.

### Prompt Caching

The Anthropic adapter (`src/lib/agentic/adapters/anthropic.ts`) sends the system prompt as a cacheable `TextBlockParam` with `cache_control: { type: 'ephemeral' }`. When multiple agents share the same base system prompt within a 5-minute window, subsequent calls hit the cache instead of re-processing the full prompt.

Cache usage is tracked per-response:
- `cacheReadInputTokens` — tokens read from cache (90% cheaper)
- `cacheCreationInputTokens` — tokens written to cache on first call

### Fallback Strategy

Each subtask has a 2-tier fallback:

1. **Tier 1 — ReWOO single-shot:** One LLM call, no tools, artifacts parsed from output. Fastest and cheapest.
2. **Tier 2 — ReAct iterative loop:** Falls back to the existing multi-turn agent executor with tools. Used when ReWOO produces no artifacts or errors.

## Adapter Selection

The `MODEL_ADAPTER` environment variable drives adapter selection:

| `MODEL_ADAPTER` | `ANTHROPIC_API_KEY` | Result |
|---|---|---|
| `anthropic` | Set | `AnthropicAdapter` with real API calls |
| `anthropic` | Empty/unset | `AnthropicAdapter` (will error on first call) |
| `mock` or unset | Any | `MockAdapter` |

## Model Resolution

Each agent definition specifies a `tier` (fast/balanced/advanced) mapped to concrete model IDs via `config/models.yaml`. The prompt assembler resolves the tier to a model ID at assembly time:

- `fast` → `claude-haiku-4-5-20251001`
- `balanced` → `claude-sonnet-4-5-20250929`
- `advanced` → `claude-opus-4-6`

Agents with an explicit `model` field in their definition override the tier-based resolution.

## Cost Projections

| Metric | Before (ReAct) | After (ReWOO + Waves) | Reduction |
|--------|----------------|----------------------|-----------|
| Tokens per 4-subtask run | ~55,000 | ~15,000 | 73% |
| Cost per run | ~$0.46 | ~$0.10 | 79% |
| LLM calls per subtask | 3-5 | 1 | 60-80% |
| Latency per subtask | ~15s | ~5s | 67% |

Cost savings come from: eliminating redundant context transmission, reducing LLM call count, prompt caching on shared system prompts, and using tier-appropriate models (Haiku for writers vs Sonnet for developers).

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/agentic/wave-executor.ts` | Sequential wave orchestration |
| `src/lib/agentic/context-builder.ts` | Pre-fetches context for ReWOO agents |
| `src/lib/agentic/artifact-parser.ts` | Parses `<<<ARTIFACT>>>` blocks |
| `src/lib/agentic/prompt-assembler.ts` | `assembleReWOO()` + model resolution |
| `src/lib/agentic/adapters/anthropic.ts` | Prompt caching + cache usage tracking |
| `src/lib/agentic/adapters/index.ts` | `MODEL_ADAPTER` env var support |
| `config/models.yaml` | Tier-to-model-ID mapping |
