---
name: Task Decomposition
description: Break a high-level task into smaller actionable subtasks
tools:
  - create_subtask
---

# Task Decomposition

## Steps
1. Parse the high-level task description
2. Identify distinct work items
3. Determine dependencies between work items
4. Create subtasks with clear titles and acceptance criteria
5. Assign priority to each subtask
6. **Assign each subtask to the most appropriate agent** using the `assigned_agent` parameter:
   - `backend-developer` — API endpoints, server logic, data models
   - `frontend-developer` — UI components, pages, user interactions
   - `qa-analyst` — test cases, test plans, verification
   - `technical-writer` — documentation, acceptance criteria, specs
   - `code-reviewer` — code quality reviews
7. **Task-specific assignment**: not all agents are needed for every task. Only assign agents relevant to the work.
8. Return the subtask list with dependency graph
