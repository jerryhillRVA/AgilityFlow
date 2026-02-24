---
name: Design Review
description: Evaluate design artifacts for completeness, consistency, feasibility, and standards compliance
tools:
  - agentic_fs_read
  - agentic_fs_search
---

# Design Review

## Steps
1. Read ALL design artifacts (both frontend and backend) for the task
2. Check **Completeness**: Are all components, endpoints, and data models fully specified?
3. Check **Consistency**: Do frontend and backend designs align? Do API contracts match what the UI expects?
4. Check **Feasibility**: Can this be implemented with the current tech stack (Next.js, TypeScript, Tailwind)?
5. Check **Standards Compliance**: REST conventions, accessibility, naming conventions, TypeScript strict mode
6. Rate each criterion: **Pass** | **Concern** | **Issue**
7. Provide specific references for any concerns or issues
8. Provide a summary verdict: **approve** or **request-changes**
