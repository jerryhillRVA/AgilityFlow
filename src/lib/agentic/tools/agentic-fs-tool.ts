import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import type { ToolRouter } from './tool-router';
import { log, startTimer, truncate } from '../logger';

export function registerAgenticFSTools(router: ToolRouter): void {
  const fs = getAgenticFSClient();

  router.register('agentic_fs_read', async (input) => {
    const fileId = input.file_id as string;
    const elapsed = startTimer();
    try {
      const result = await fs.batchRetrieve([fileId]);
      if (result.files.length === 0) {
        log.warn('fs-tool', `agentic_fs_read: file not found`, { fileId, elapsedMs: elapsed() });
        return { error: 'File not found' };
      }
      log.debug('fs-tool', `agentic_fs_read`, { fileId, elapsedMs: elapsed() });
      return result.files[0];
    } catch (error) {
      log.error('fs-tool', `agentic_fs_read failed`, { fileId, error: String(error), elapsedMs: elapsed() });
      return { error: `Failed to read file: ${error}` };
    }
  });

  router.register('agentic_fs_write', async (input) => {
    const filename = input.filename as string;
    const contentLength = (input.content as string)?.length || 0;
    const elapsed = startTimer();
    try {
      const result = await fs.uploadFile(
        input.content as string,
        filename,
        {
          namespace: (input.namespace as string) || 'default',
          path: (input.path as string) || '',
          tags: input.tags as string[] | undefined,
        }
      );
      const fileId = (result as unknown as Record<string, unknown>)?.file_id || 'unknown';
      log.debug('fs-tool', `agentic_fs_write`, { filename, namespace: input.namespace, contentLength, fileId, elapsedMs: elapsed() });
      return result;
    } catch (error) {
      log.error('fs-tool', `agentic_fs_write failed`, { filename, namespace: input.namespace, error: String(error), elapsedMs: elapsed() });
      return { error: `Failed to write file: ${error}` };
    }
  });

  router.register('agentic_fs_search', async (input) => {
    const query = input.query as string;
    const elapsed = startTimer();
    try {
      const result = await fs.hybridSearch(query, {
        k: (input.k as number) || 10,
        namespace: input.namespace as string | undefined,
      });
      const resultCount = Array.isArray(result) ? result.length : ((result as unknown as Record<string, unknown>)?.results as unknown[])?.length || 0;
      log.debug('fs-tool', `agentic_fs_search`, { query: truncate(query, 80), namespace: input.namespace, resultCount, elapsedMs: elapsed() });
      return result;
    } catch (error) {
      log.error('fs-tool', `agentic_fs_search failed`, { query: truncate(query, 80), error: String(error), elapsedMs: elapsed() });
      return { error: `Search failed: ${error}` };
    }
  });

  router.register('agentic_fs_list', async (input) => {
    const path = (input.path as string) || 'root';
    const elapsed = startTimer();
    try {
      const result = await fs.listDirectory(path, input.namespace as string | undefined);
      const entryCount = Array.isArray(result) ? result.length : ((result as unknown as Record<string, unknown>)?.entries as unknown[])?.length || 0;
      log.debug('fs-tool', `agentic_fs_list`, { path, namespace: input.namespace, entryCount, elapsedMs: elapsed() });
      return result;
    } catch (error) {
      log.error('fs-tool', `agentic_fs_list failed`, { path, error: String(error), elapsedMs: elapsed() });
      return { error: `List failed: ${error}` };
    }
  });

  router.register('agentic_fs_ask', async (input) => {
    const query = input.query as string;
    const elapsed = startTimer();
    try {
      const result = await fs.ask(query, {
        k: (input.k as number) || 5,
        namespace: input.namespace as string | undefined,
        systemPrompt: input.system_prompt as string | undefined,
      });
      const answerLength = JSON.stringify(result).length;
      log.debug('fs-tool', `agentic_fs_ask`, { query: truncate(query, 80), namespace: input.namespace, answerLength, elapsedMs: elapsed() });
      return result;
    } catch (error) {
      log.error('fs-tool', `agentic_fs_ask failed`, { query: truncate(query, 80), error: String(error), elapsedMs: elapsed() });
      return { error: `Ask failed: ${error}` };
    }
  });

  router.register('agentic_fs_batch_read', async (input) => {
    const fileIds = input.file_ids as string[];
    const elapsed = startTimer();
    try {
      const result = await fs.batchRetrieve(fileIds);
      log.debug('fs-tool', `agentic_fs_batch_read`, { fileCount: fileIds.length, elapsedMs: elapsed() });
      return result;
    } catch (error) {
      log.error('fs-tool', `agentic_fs_batch_read failed`, { fileCount: fileIds.length, error: String(error), elapsedMs: elapsed() });
      return { error: `Batch read failed: ${error}` };
    }
  });
}
