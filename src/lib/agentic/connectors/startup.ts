import { getGitHubConnector } from './github-connector';
import { eventBus } from '../events/emitter';
import { createEvent } from '../events/types';

let initialized = false;

/**
 * Initialize all connectors on startup.
 * Called from the orchestrator initialization path.
 * Non-blocking — fires and forgets so it doesn't delay orchestrator readiness.
 */
export function initializeConnectors(): void {
  if (initialized) return;
  initialized = true;

  getGitHubConnector().initialize().catch((error) => {
    eventBus.emit(createEvent(
      'system:error',
      `Connector startup error: ${String(error)}`,
      { error: String(error) },
    ));
  });
}
