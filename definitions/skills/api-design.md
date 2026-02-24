---
name: API Design
description: Produce detailed API design specifications including endpoint contracts, data models, error handling, and integration patterns
tools:
  - agentic_fs_write
  - agentic_fs_ask
  - agentic_fs_search
---

# API Design

## Core Rule
You MUST produce detailed API design specifications as artifacts. Describing what you might design is NOT acceptable — you must write complete, actionable design documents that an implementation agent can follow.

## Artifact Output

### When using tools (ReAct mode)
Write each design document as a separate artifact using `agentic_fs_write`:
```
agentic_fs_write({ filename: "users-api-design.md", content: "<full design spec>", category: "design" })
```

### When producing delimited output (ReWOO mode)
Wrap each design document in artifact delimiters:
```
<<<ARTIFACT filename="users-api-design.md" category="design">>>
// Full design specification here
<<<END_ARTIFACT>>>
```

## Design Specification Standards
1. Every design MUST be a complete, actionable specification — no vague descriptions, no TODOs
2. Use Next.js App Router conventions in your endpoint specs (`route.ts` with `GET`, `POST`, `PATCH`, `DELETE`)
3. Specify `NextResponse.json()` response format for all endpoints
4. Error format: `{ error: string, details?: unknown }`
5. Document all TypeScript interfaces for request/response bodies
6. Follow existing patterns from the codebase

## Endpoint Contract Format
For each endpoint, specify:
- **Method & Path**: e.g., `PATCH /api/tasks/:taskId/status`
- **Query Parameters**: name, type, required/optional, description
- **Request Body Schema**: TypeScript interface with field descriptions
- **Response Schemas**: one per status code (200, 201, 400, 404, 500)
- **Auth/Permissions**: what access is required
- **Side Effects**: events emitted, FS writes, etc.

## Data Model Format
For each entity, specify:
- TypeScript interface with all fields
- Required vs optional fields
- Validation rules and constraints
- Relationships to other entities
- Default values

## Naming Convention
- API design artifacts: `{feature}-api-design.md` (e.g., `tasks-api-design.md`)
- Data model artifacts: `{feature}-data-model.md` (e.g., `sprint-data-model.md`)
- Integration flow artifacts: `{feature}-integration-flow.md`

## Checklist Before Completion
- [ ] At least one artifact with `category: "design"` was written
- [ ] Each endpoint has a complete contract (method, path, schemas, status codes)
- [ ] All TypeScript interfaces are fully defined
- [ ] Error handling strategy is documented
- [ ] Integration patterns and side effects are specified
