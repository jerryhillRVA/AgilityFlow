---
name: UI Design
description: Produce detailed UI design specifications including component architecture, state management, styling, and interaction flows
tools:
  - agentic_fs_write
  - agentic_fs_ask
  - agentic_fs_search
---

# UI Design

## Core Rule
You MUST produce detailed design specifications as artifacts. Describing what you might design is NOT acceptable — you must write complete, actionable design documents that an implementation agent can follow.

## Artifact Output

### When using tools (ReAct mode)
Write each design document as a separate artifact using `agentic_fs_write`:
```
agentic_fs_write({ filename: "dashboard-design.md", content: "<full design spec>", category: "design" })
```

### When producing delimited output (ReWOO mode)
Wrap each design document in artifact delimiters:
```
<<<ARTIFACT filename="dashboard-design.md" category="design">>>
// Full design specification here
<<<END_ARTIFACT>>>
```

## Design Specification Standards
1. Every design MUST be a complete, actionable specification — no vague descriptions, no TODOs
2. Include component hierarchy with parent → child relationships
3. Define props interface for each component (TypeScript interface notation)
4. Specify state management approach (local state, context, external store)
5. List Tailwind CSS classes and CSS custom properties for styling
6. Document responsive behavior (mobile, tablet, desktop breakpoints)
7. Describe interaction flows: user action → state change → visual feedback
8. Include accessibility requirements (ARIA attributes, keyboard navigation)

## Naming Convention
- Component design artifacts: `{component-name}-design.md` (e.g., `sprint-board-design.md`)
- Interaction flow artifacts: `{feature}-interaction-flow.md` (e.g., `task-creation-interaction-flow.md`)
- Page design artifacts: `{feature}-page-design.md` (e.g., `dashboard-page-design.md`)

## Checklist Before Completion
- [ ] At least one artifact with `category: "design"` was written
- [ ] Each artifact contains a complete component hierarchy
- [ ] Props interfaces defined for all components
- [ ] Styling specifications use project's Tailwind + CSS custom properties
- [ ] Interaction flows are documented end-to-end
- [ ] Accessibility requirements are specified
