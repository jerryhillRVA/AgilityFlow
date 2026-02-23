---
name: API Design
description: Design and implement API endpoints, route handlers, and server-side logic as artifact files
tools:
  - agentic_fs_write
  - agentic_fs_ask
  - agentic_fs_search
---

# API Design

## Core Rule
You MUST produce actual source code as artifacts. Describing what you would implement is NOT acceptable — you must write the complete, working code.

## Artifact Output

### When using tools (ReAct mode)
Write each code file as a separate artifact using `agentic_fs_write`:
```
agentic_fs_write({ filename: "route.ts", content: "<full source code>", category: "implementation" })
```

### When producing delimited output (ReWOO mode)
Wrap each code file in artifact delimiters:
```
<<<ARTIFACT filename="route.ts" category="implementation">>>
// Full source code here
<<<END_ARTIFACT>>>
```

## Implementation Standards
1. Every route or module MUST be a complete, runnable file — no pseudocode, no placeholders, no TODOs
2. Use Next.js App Router conventions (`route.ts` with named exports: `GET`, `POST`, `PATCH`, `DELETE`)
3. Use `NextResponse.json()` for all API responses
4. Error format: `{ error: string, details?: unknown }`
5. Use `async/await` with `try/catch` — no raw promises
6. Follow existing patterns from the codebase

## Naming Convention
- Route artifacts: `route.ts` or `{feature}-route.ts`
- Service/logic artifacts: `{feature}-service.ts`
- Type artifacts: `{feature}-types.ts`
- Utility artifacts: `{feature}-utils.ts`

## Checklist Before Completion
- [ ] At least one artifact with `category: "implementation"` was written
- [ ] Each artifact contains complete, compilable TypeScript code
- [ ] No placeholder comments like "// TODO" or "// implement this"
