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
    const isOrchestrator = systemPrompt.includes('orchestrator');
    const isPlanMode = request.systemPrompt.includes('PLAN ONLY') || userMsg.includes('PLAN ONLY');
    const isTechnicalWriter = systemPrompt.includes('technical writer');
    const isQAAnalyst = systemPrompt.includes('qa analyst') || systemPrompt.includes('qa specialist');
    const isDeveloper = systemPrompt.includes('backend') || systemPrompt.includes('frontend');
    const isCodeReviewer = systemPrompt.includes('code reviewer') || systemPrompt.includes('review code');

    // Detect if this is the first call in a conversation (no tool_result messages yet)
    const hasToolResults = request.messages.some(
      m => m.role === 'user' && Array.isArray(m.content) && (m.content as ContentBlock[]).some(b => b.type === 'tool_result')
    );
    const isFirstCall = !hasToolResults;

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

    // Developer agents: create implementation artifacts
    if (isDeveloper && hasTools && isFirstCall) {
      const isBackend = systemPrompt.includes('backend');
      return this.simulateImplementationArtifact(userMsg, isBackend);
    }

    // Code Reviewer: create verification artifacts
    if (isCodeReviewer && hasTools && isFirstCall) {
      return this.simulateReviewArtifact(userMsg);
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
          },
        },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'create_subtask',
          input: {
            title: `Implement: ${taskTitle}`,
            description: `Implement the core functionality as described in the task requirements. Follow project conventions and create implementation artifacts.`,
            priority: 'medium',
            assigned_agent: 'backend-developer',
          },
        },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'create_subtask',
          input: {
            title: `Review implementation for: ${taskTitle}`,
            description: `Review all implementation artifacts for code quality, security, maintainability, and correctness. Create a review report with findings.`,
            priority: 'low',
            assigned_agent: 'code-reviewer',
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
        { type: 'text', text: `Analyzing task: "${userMsg.slice(0, 100)}..."\n\nI'll delegate this to the backend developer for implementation.` },
        {
          type: 'tool_use',
          id: toolCallId,
          name: 'delegate_to_agent',
          input: {
            agent_id: 'backend-developer',
            task_title: `Implement: ${userMsg.slice(0, 50)}`,
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

  private simulateImplementationArtifact(userMsg: string, isBackend: boolean): ModelResponse {
    const taskRef = userMsg.slice(0, 50);
    const agentType = isBackend ? 'Backend' : 'Frontend';
    const filename = isBackend ? 'api-implementation.md' : 'ui-implementation.md';
    const content = isBackend
      ? `# API Implementation\n\n## Task: ${taskRef}\n\n### Endpoint Design\n\n\`\`\`\nPATCH /api/resource/:id\nBody: { field: value }\nResponse: { id, field, updatedAt }\n\`\`\`\n\n### Data Model\n\n\`\`\`typescript\ninterface Resource {\n  id: string;\n  field: string;\n  updatedAt: string;\n}\n\`\`\`\n\n### Implementation Notes\n- Uses NextResponse.json() for responses\n- Validates input before processing\n- Emits events on state changes\n- Persists to Agentic FS\n`
      : `# UI Implementation\n\n## Task: ${taskRef}\n\n### Component Structure\n\n\`\`\`\nResourceView\n  ├── ResourceHeader\n  ├── ResourceContent\n  └── ResourceActions\n\`\`\`\n\n### Implementation Notes\n- React functional components with hooks\n- Tailwind CSS for styling\n- Responsive design with mobile-first approach\n- Error boundaries for graceful error handling\n`;

    return {
      content: [
        { type: 'text', text: `${agentType} implementation for: "${taskRef}..."` },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'agentic_fs_write',
          input: {
            filename,
            content,
            namespace: 'artifacts',
            path: 'code',
            category: 'implementation',
          },
        },
      ],
      stopReason: 'tool_use',
      usage: { inputTokens: 120, outputTokens: 150 },
    };
  }

  private simulateReviewArtifact(userMsg: string): ModelResponse {
    const taskRef = userMsg.slice(0, 50);
    return {
      content: [
        { type: 'text', text: `Reviewing implementation for: "${taskRef}..."` },
        {
          type: 'tool_use',
          id: `toolu_${uuid().slice(0, 12)}`,
          name: 'agentic_fs_write',
          input: {
            filename: 'code-review-report.md',
            content: `# Code Review Report\n\n## Task: ${taskRef}\n\n### Summary\nOverall: **Pass** with minor suggestions\n\n### Evaluation\n\n| Criteria | Rating | Notes |\n|----------|--------|-------|\n| Correctness | Pass | Implementation matches requirements |\n| Security | Pass | No vulnerabilities identified |\n| Maintainability | Pass | Code is clear and well-structured |\n| Performance | Pass | No obvious bottlenecks |\n\n### Suggestions\n- Consider adding error boundary for edge cases\n- Unit test coverage could be expanded\n\n### Verdict\n**Approved** — ready for final review.\n`,
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
