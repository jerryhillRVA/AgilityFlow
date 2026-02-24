import type { ModelAdapter, ModelRequest, ModelResponse, ContentBlock } from './model-adapter';
import { v4 as uuid } from 'uuid';

export class MockAdapter implements ModelAdapter {
  name = 'mock';
  private callCount = 0;

  async chat(request: ModelRequest): Promise<ModelResponse> {
    this.callCount++;
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

    const userMsg = this.extractUserMessage(request);
    const systemPrompt = request.systemPrompt.toLowerCase();
    const hasTools = request.tools && request.tools.length > 0;
    const isReWOO = systemPrompt.includes('<<<artifact') && !hasTools;
    const isOrchestrator = systemPrompt.includes('orchestrator');
    const isPlanMode = request.systemPrompt.includes('PLAN ONLY') || userMsg.includes('PLAN ONLY');
    const isTechnicalWriter = systemPrompt.includes('technical writer');
    const isQAAnalyst = systemPrompt.includes('qa analyst') || systemPrompt.includes('qa specialist');
    const isDesigner = systemPrompt.includes('designer') || systemPrompt.includes('design specialist');
    const isDesignReviewer = systemPrompt.includes('design reviewer') || systemPrompt.includes('review') && systemPrompt.includes('design artifacts');

    // Detect if this is the first call in a conversation (no tool_result messages yet)
    const hasToolResults = request.messages.some(
      m => m.role === 'user' && Array.isArray(m.content) && (m.content as ContentBlock[]).some(b => b.type === 'tool_result')
    );
    const isFirstCall = !hasToolResults;

    // ReWOO single-shot mode: return artifacts in delimited format (no tools)
    if (isReWOO) {
      return this.simulateReWOOResponse(userMsg, isTechnicalWriter, isQAAnalyst, isDesigner, isDesignReviewer);
    }

    // Orchestrator in plan mode: create subtasks instead of delegating
    if (isOrchestrator && isPlanMode && hasTools && isFirstCall) {
      return this.simulatePlanDecomposition(userMsg);
    }

    // Orchestrator in execute mode: delegate
    if (isOrchestrator && !isPlanMode && hasTools && isFirstCall) {
      const hasDelegationTool = request.tools?.some(t => t.name === 'delegate_to_agent');
      if (hasDelegationTool) {
        return this.simulateDelegation(userMsg);
      }
    }

    // Technical Writer: create documentation artifacts
    if (isTechnicalWriter && hasTools && isFirstCall) {
      return this.simulateDocumentationGeneration(userMsg);
    }

    // QA Analyst: create test case artifacts
    if (isQAAnalyst && hasTools && isFirstCall) {
      return this.simulateTestCaseGeneration(userMsg);
    }

    // Designer agents: create design artifacts
    if (isDesigner && hasTools && isFirstCall) {
      const isBackend = systemPrompt.includes('backend');
      return this.simulateDesignArtifact(userMsg, isBackend);
    }

    // Design Reviewer: create verification artifacts
    if (isDesignReviewer && hasTools && isFirstCall) {
      return this.simulateDesignReviewArtifact(userMsg);
    }

    // Default: return a text response (second call or unknown agent)
    return this.simulateTextResponse(userMsg, isOrchestrator);
  }

  private simulatePlanDecomposition(userMsg: string): ModelResponse {
    const taskTitle = userMsg.slice(0, 60);
    return {
      content: [
        { type: 'text', text: `Analyzing task: "${taskTitle}..."\n\nI'll decompose this into subtasks with appropriate agent assignments.` },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'create_subtask',
          input: {
            title: `Write acceptance criteria and requirements for: ${taskTitle}`,
            description: `Create detailed acceptance criteria and requirements documentation for this task. Define clear, testable success criteria using Given/When/Then format. Document scope, constraints, and dependencies.`,
            priority: 'high',
            assigned_agent: 'technical-writer',
            execution_order: 1,
          },
        },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'create_subtask',
          input: {
            title: `Create test cases for: ${taskTitle}`,
            description: `Create comprehensive test cases covering API tests, UI tests, and integration tests as applicable. Include both happy path and error scenarios with clear pass/fail criteria.`,
            priority: 'high',
            assigned_agent: 'qa-analyst',
            execution_order: 2,
          },
        },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'create_subtask',
          input: {
            title: `Design API and data models for: ${taskTitle}`,
            description: `Design the API endpoints, data models, and server-side architecture. Produce detailed design specifications as artifacts.`,
            priority: 'medium',
            assigned_agent: 'backend-designer',
            execution_order: 2,
          },
        },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'create_subtask',
          input: {
            title: `Design UI components for: ${taskTitle}`,
            description: `Design the UI component architecture, state management, styling, and interaction flows. Produce detailed design specifications as artifacts.`,
            priority: 'medium',
            assigned_agent: 'frontend-designer',
            execution_order: 2,
          },
        },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'create_subtask',
          input: {
            title: `Review designs for: ${taskTitle}`,
            description: `Review all frontend and backend design artifacts for completeness, consistency, feasibility, and standards compliance. Create a consolidated design review report.`,
            priority: 'low',
            assigned_agent: 'design-reviewer',
            execution_order: 3,
          },
        },
      ],
      stopReason: 'tool_use',
      usage: { inputTokens: 200, outputTokens: 250 },
    };
  }

  private simulateDelegation(userMsg: string): ModelResponse {
    const toolCallId = `toolu_${uuid().slice(0, 12)}`;
    return {
      content: [
        { type: 'text', text: `Analyzing task: "${userMsg.slice(0, 100)}..."\n\nI'll delegate this to the backend designer for design specifications.` },
        {
          type: 'tool_use',
          id: toolCallId,
          name: 'delegate_to_agent',
          input: {
            agent_id: 'backend-designer',
            task_title: `Design: ${userMsg.slice(0, 50)}`,
            task_description: userMsg,
            priority: 'medium',
          },
        },
      ],
      stopReason: 'tool_use',
      usage: { inputTokens: 150, outputTokens: 80 },
    };
  }

  private simulateDocumentationGeneration(userMsg: string): ModelResponse {
    const taskRef = userMsg.slice(0, 50);
    return {
      content: [
        { type: 'text', text: `Creating documentation artifacts for: "${taskRef}..."` },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'agentic_fs_write',
          input: {
            filename: 'acceptance-criteria.md',
            content: `# Acceptance Criteria\n\n## Task: ${taskRef}\n\n### Criteria\n\n1. **Given** the task requirements are defined\n   **When** the implementation is complete\n   **Then** all functional requirements are met\n\n2. **Given** the system is running\n   **When** the feature is used\n   **Then** it behaves as specified without errors\n\n3. **Given** test cases exist\n   **When** all tests are executed\n   **Then** all tests pass successfully\n\n### Out of Scope\n- Performance optimization\n- Cross-browser testing beyond Chrome\n\n### Dependencies\n- None identified\n`,
            namespace: 'artifacts',
            path: 'docs',
            category: 'requirements',
          },
        },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'agentic_fs_write',
          input: {
            filename: 'requirements-summary.md',
            content: `# Requirements Summary\n\n## Task: ${taskRef}\n\n### Overview\nThis document summarizes the requirements for the task.\n\n### Functional Requirements\n1. The system shall support the described functionality\n2. All user interactions shall be validated\n3. Results shall be persisted to the Agentic FS\n\n### Non-Functional Requirements\n- Response time: < 2 seconds for all operations\n- Error handling: All errors shall be caught and reported\n- Logging: All significant actions shall emit events\n\n### Constraints\n- Must follow existing project conventions\n- TypeScript strict mode required\n- No additional external dependencies\n`,
            namespace: 'artifacts',
            path: 'docs',
            category: 'requirements',
          },
        },
      ],
      stopReason: 'tool_use',
      usage: { inputTokens: 150, outputTokens: 200 },
    };
  }

  private simulateTestCaseGeneration(userMsg: string): ModelResponse {
    const taskRef = userMsg.slice(0, 50);
    return {
      content: [
        { type: 'text', text: `Creating test cases for: "${taskRef}..."` },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'agentic_fs_write',
          input: {
            filename: 'test-cases.md',
            content: `# Test Cases\n\n## Task: ${taskRef}\n\n### API Tests\n\n| # | Test Case | Method | Endpoint | Expected Status | Expected Behavior |\n|---|-----------|--------|----------|-----------------|-------------------|\n| 1 | Create resource | POST | /api/resource | 201 | Returns created resource |\n| 2 | Get resource | GET | /api/resource/:id | 200 | Returns resource data |\n| 3 | Invalid input | POST | /api/resource | 400 | Returns validation error |\n| 4 | Not found | GET | /api/resource/:id | 404 | Returns not found error |\n\n### UI Tests\n\n| # | Test Case | Component | Action | Expected Result |\n|---|-----------|-----------|--------|----------------|\n| 1 | Render component | Main view | Load page | Component renders without errors |\n| 2 | User interaction | Form | Submit valid data | Success feedback shown |\n| 3 | Error state | Form | Submit invalid data | Error message displayed |\n| 4 | Loading state | Main view | During fetch | Loading indicator shown |\n\n### Integration Tests\n\n| # | Test Case | Flow | Expected Result |\n|---|-----------|------|----------------|\n| 1 | End-to-end create | UI → API → FS | Resource created and visible in UI |\n| 2 | Error propagation | API error → UI | Error displayed to user |\n\n### Pass/Fail Criteria\n- All API tests must return expected status codes\n- All UI components must render without console errors\n- All integration flows must complete within 5 seconds\n`,
            namespace: 'artifacts',
            path: 'specs',
            category: 'verification',
          },
        },
      ],
      stopReason: 'tool_use',
      usage: { inputTokens: 150, outputTokens: 180 },
    };
  }

  private simulateDesignArtifact(userMsg: string, isBackend: boolean): ModelResponse {
    const taskRef = userMsg.slice(0, 50);
    const agentType = isBackend ? 'Backend' : 'Frontend';
    const filename = isBackend ? 'api-design-spec.md' : 'ui-design-spec.md';
    const content = isBackend
      ? `# API Design Specification\n\n## Task: ${taskRef}\n\n### Endpoint Contracts\n\n| Method | Path | Request Body | Response | Status |\n|--------|------|-------------|----------|--------|\n| PATCH | /api/resource/:id | \`{ field: string }\` | \`{ id, field, updatedAt }\` | 200 |\n| POST | /api/resource | \`{ field: string }\` | \`{ id, field, createdAt }\` | 201 |\n| GET | /api/resource/:id | — | \`{ id, field, updatedAt }\` | 200 |\n\n### Data Models\n\n\`\`\`typescript\ninterface Resource {\n  id: string;\n  field: string;\n  createdAt: string;\n  updatedAt: string;\n}\n\`\`\`\n\n### Error Handling Strategy\n- 400 for validation errors with \`{ error: string }\` body\n- 404 when resource not found\n- 500 with generic error message for internal errors\n\n### Integration Points\n- Persists to Agentic FS \`artifacts\` namespace\n- Emits events via event bus on state changes\n- Uses NextResponse.json() for all responses\n`
      : `# UI Design Specification\n\n## Task: ${taskRef}\n\n### Component Hierarchy\n\n\`\`\`\nResourceView\n  ├── ResourceHeader (props: title, status)\n  ├── ResourceContent (props: data, loading)\n  │   ├── ContentSection\n  │   └── LoadingPlaceholder\n  └── ResourceActions (props: onSave, onCancel, disabled)\n\`\`\`\n\n### Props Interfaces\n\n\`\`\`typescript\ninterface ResourceViewProps {\n  resourceId: string;\n  onClose: () => void;\n}\n\ninterface ResourceHeaderProps {\n  title: string;\n  status: 'active' | 'archived';\n}\n\`\`\`\n\n### State Management\n- Local state via useState for form data and loading\n- useEffect for initial data fetch\n- useCallback for memoized handlers\n\n### Styling Specifications\n- Container: \`bg-secondary\`, \`rounded-lg\`, \`border border-[var(--border)]\`\n- Header: \`text-sm font-semibold\`, color \`var(--text-primary)\`\n- Responsive: stack on mobile (< 640px), side-by-side on desktop\n\n### Interaction Flows\n1. User opens view → loading state → data renders\n2. User edits field → local state update → save button enables\n3. User saves → loading → success toast → view updates\n\n### Accessibility\n- All interactive elements have aria-labels\n- Keyboard navigation: Tab through actions, Enter to submit\n- Focus trap within modal if applicable\n`;

    return {
      content: [
        { type: 'text', text: `${agentType} design specification for: "${taskRef}..."` },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'agentic_fs_write',
          input: {
            filename,
            content,
            namespace: 'artifacts',
            path: 'designs',
            category: 'design',
          },
        },
      ],
      stopReason: 'tool_use',
      usage: { inputTokens: 120, outputTokens: 150 },
    };
  }

  private simulateDesignReviewArtifact(userMsg: string): ModelResponse {
    const taskRef = userMsg.slice(0, 50);
    return {
      content: [
        { type: 'text', text: `Reviewing designs for: "${taskRef}..."` },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'agentic_fs_write',
          input: {
            filename: 'design-review-report.md',
            content: `# Design Review Report\n\n## Task: ${taskRef}\n\n### Summary\nConsolidated review of frontend and backend design artifacts.\nOverall: **Pass** with minor suggestions\n\n### Evaluation\n\n| Criteria | Rating | Notes |\n|----------|--------|-------|\n| Completeness | Pass | All required components and endpoints specified |\n| Consistency | Pass | Frontend and backend designs align on API contracts |\n| Feasibility | Pass | Implementable with current Next.js + TypeScript stack |\n| Standards | Pass | Follows project naming conventions and patterns |\n\n### Cross-Design Consistency\n- API response shapes match frontend expected data structures\n- Error handling approaches consistent across frontend and backend\n- Naming conventions aligned between designs\n\n### Suggestions\n- Consider adding optimistic UI updates for better UX\n- Backend could benefit from input validation middleware pattern\n\n### Verdict\n**Approved** — designs are ready for implementation.\n`,
            namespace: 'artifacts',
            path: 'reviews',
            category: 'verification',
          },
        },
      ],
      stopReason: 'tool_use',
      usage: { inputTokens: 120, outputTokens: 130 },
    };
  }

  private simulateTextResponse(userMsg: string, isOrchestrator: boolean): ModelResponse {
    const role = isOrchestrator ? 'Orchestrator' : 'Agent';
    const content: ContentBlock[] = [{
      type: 'text',
      text: `[${role} Mock Response]\n\nI've analyzed the task: "${userMsg.slice(0, 80)}"\n\n## Summary\nThis task has been processed successfully.\n\n## Actions Taken\n- Reviewed the requirements\n- Identified key deliverables\n- Generated initial implementation plan\n\n## Result\nTask completed with mock adapter. Connect a real LLM provider for actual agent execution.`,
    }];

    return {
      content,
      stopReason: 'end_turn',
      usage: { inputTokens: 100, outputTokens: 60 },
    };
  }

  private simulateReWOOResponse(
    userMsg: string,
    isTechnicalWriter: boolean,
    isQAAnalyst: boolean,
    isDesigner: boolean,
    isDesignReviewer: boolean,
  ): ModelResponse {
    const taskRef = userMsg.slice(0, 50);
    let artifactText: string;

    if (isTechnicalWriter) {
      artifactText = [
        `Generating documentation for "${taskRef}..."`,
        '',
        `<<<ARTIFACT filename="acceptance-criteria.md" category="requirements">>>`,
        `# Acceptance Criteria`,
        ``,
        `## Task: ${taskRef}`,
        ``,
        `### Criteria`,
        `1. **Given** the requirements are defined **When** implementation is complete **Then** all requirements are met`,
        `2. **Given** the system is running **When** the feature is used **Then** it behaves as specified`,
        `3. **Given** test cases exist **When** all tests run **Then** all tests pass`,
        `<<<END_ARTIFACT>>>`,
        '',
        `<<<ARTIFACT filename="requirements-summary.md" category="requirements">>>`,
        `# Requirements Summary`,
        ``,
        `## Task: ${taskRef}`,
        ``,
        `### Functional Requirements`,
        `1. The system shall support the described functionality`,
        `2. All user interactions shall be validated`,
        `3. Results shall be persisted to the Agentic FS`,
        `<<<END_ARTIFACT>>>`,
        '',
        'Documentation artifacts generated successfully.',
      ].join('\n');
    } else if (isQAAnalyst) {
      artifactText = [
        `Creating test cases for "${taskRef}..."`,
        '',
        `<<<ARTIFACT filename="test-cases.md" category="verification">>>`,
        `# Test Cases`,
        ``,
        `## Task: ${taskRef}`,
        ``,
        `| # | Test Case | Expected Result |`,
        `|---|-----------|-----------------|`,
        `| 1 | Create resource | Returns 201 with created resource |`,
        `| 2 | Get resource | Returns 200 with resource data |`,
        `| 3 | Invalid input | Returns 400 with validation error |`,
        `| 4 | Not found | Returns 404 |`,
        `<<<END_ARTIFACT>>>`,
        '',
        'Test case artifacts generated successfully.',
      ].join('\n');
    } else if (isDesigner) {
      const isBackend = userMsg.toLowerCase().includes('backend') || userMsg.toLowerCase().includes('api');
      const filename = isBackend ? 'api-design-spec.md' : 'ui-design-spec.md';
      artifactText = [
        `Designing "${taskRef}..."`,
        '',
        `<<<ARTIFACT filename="${filename}" category="design">>>`,
        `# ${isBackend ? 'API' : 'UI'} Design Specification`,
        ``,
        `## Task: ${taskRef}`,
        ``,
        `### Design Overview`,
        `- Component architecture and contracts defined`,
        `- State management approach specified`,
        `- Interaction flows documented`,
        `- Accessibility requirements included`,
        `<<<END_ARTIFACT>>>`,
        '',
        'Design artifacts generated successfully.',
      ].join('\n');
    } else if (isDesignReviewer) {
      artifactText = [
        `Reviewing designs for "${taskRef}..."`,
        '',
        `<<<ARTIFACT filename="design-review-report.md" category="verification">>>`,
        `# Design Review Report`,
        ``,
        `## Task: ${taskRef}`,
        ``,
        `### Summary`,
        `Overall: **Pass** — designs are complete and consistent`,
        ``,
        `### Evaluation`,
        `| Criteria | Rating |`,
        `|----------|--------|`,
        `| Completeness | Pass |`,
        `| Consistency | Pass |`,
        `| Feasibility | Pass |`,
        `| Standards | Pass |`,
        ``,
        `### Verdict`,
        `**Approved** — designs are ready for implementation.`,
        `<<<END_ARTIFACT>>>`,
        '',
        'Design review artifacts generated successfully.',
      ].join('\n');
    } else {
      artifactText = [
        `Processing "${taskRef}..."`,
        '',
        `<<<ARTIFACT filename="output.md" category="other">>>`,
        `# Output`,
        ``,
        `## Task: ${taskRef}`,
        ``,
        `Task processed successfully with mock adapter.`,
        `<<<END_ARTIFACT>>>`,
        '',
        'Artifacts generated successfully.',
      ].join('\n');
    }

    return {
      content: [{ type: 'text', text: artifactText }],
      stopReason: 'end_turn',
      usage: { inputTokens: 150, outputTokens: 200 },
    };
  }

  private extractUserMessage(request: ModelRequest): string {
    for (let i = request.messages.length - 1; i >= 0; i--) {
      const msg = request.messages[i];
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') return msg.content;
        const textBlock = (msg.content as ContentBlock[]).find(b => b.type === 'text');
        if (textBlock?.text) return textBlock.text;
      }
    }
    return 'Unknown task';
  }
}
