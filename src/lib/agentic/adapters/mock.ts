import type { ModelAdapter, ModelRequest, ModelResponse, ContentBlock } from './model-adapter';
import { v4 as uuid } from 'uuid';

export class MockAdapter implements ModelAdapter {
  name = 'mock';
  private callCount = 0;

  async chat(request: ModelRequest): Promise<ModelResponse> {
    this.callCount++;
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

    const userMsg = this.extractUserMessage(request);
    const hasTools = request.tools && request.tools.length > 0;
    const isOrchestrator = request.systemPrompt.toLowerCase().includes('orchestrator');

    // On first call for orchestrator with tools, simulate a delegation
    if (isOrchestrator && hasTools && this.callCount <= 2) {
      const hasDelegationTool = request.tools?.some(t => t.name === 'delegate_to_agent');
      if (hasDelegationTool) {
        return this.simulateDelegation(userMsg);
      }
    }

    // Default: return a text response
    return this.simulateTextResponse(userMsg, isOrchestrator);
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
