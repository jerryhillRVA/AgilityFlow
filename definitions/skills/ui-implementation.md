---
name: UI Implementation
description: Build React/Next.js components and pages as artifact files
tools:
  - agentic_fs_write
  - agentic_fs_ask
  - agentic_fs_search
---

# UI Implementation

## Core Rule
You MUST produce actual source code as artifacts. Describing what you would implement is NOT acceptable — you must write the complete, working code.

## Artifact Output

### When using tools (ReAct mode)
Write each code file as a separate artifact using `agentic_fs_write`:
```
agentic_fs_write({ filename: "tickets-page.tsx", content: "<full source code>", category: "implementation" })
```

### When producing delimited output (ReWOO mode)
Wrap each code file in artifact delimiters:
```
<<<ARTIFACT filename="tickets-page.tsx" category="implementation">>>
// Full source code here
<<<END_ARTIFACT>>>
```

## Implementation Standards
1. Every page or component MUST be a complete, runnable file — no pseudocode, no placeholders, no TODOs
2. Use `'use client'` directive when the component needs state, effects, or browser APIs
3. Use TypeScript with proper type annotations
4. Style with Tailwind CSS using the project's CSS custom properties (dark theme)
5. Follow existing patterns: fetch from API routes, use `useMemo`/`useCallback` for performance

## Naming Convention
- Page artifacts: `{feature}-page.tsx` (e.g., `tickets-page.tsx`)
- Component artifacts: `{component-name}.tsx` (e.g., `ticket-filter.tsx`)
- Type artifacts: `{feature}-types.ts` (e.g., `tickets-types.ts`)

## Checklist Before Completion
- [ ] At least one artifact with `category: "implementation"` was written
- [ ] Each artifact contains complete, compilable TypeScript/TSX code
- [ ] No placeholder comments like "// TODO" or "// implement this"
