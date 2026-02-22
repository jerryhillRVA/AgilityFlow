import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import type { ToolRouter } from './tool-router';

export function registerAgenticFSTools(router: ToolRouter): void {
  const fs = getAgenticFSClient();

  router.register('agentic_fs_read', async (input) => {
    const fileId = input.file_id as string;
    try {
      const result = await fs.batchRetrieve([fileId]);
      if (result.files.length === 0) return { error: 'File not found' };
      return result.files[0];
    } catch (error) {
      return { error: `Failed to read file: ${error}` };
    }
  });

  router.register('agentic_fs_write', async (input) => {
    try {
      return await fs.uploadFile(
        input.content as string,
        input.filename as string,
        {
          namespace: (input.namespace as string) || 'default',
          path: (input.path as string) || '',
          tags: input.tags as string[] | undefined,
        }
      );
    } catch (error) {
      return { error: `Failed to write file: ${error}` };
    }
  });

  router.register('agentic_fs_search', async (input) => {
    try {
      return await fs.hybridSearch(input.query as string, {
        k: (input.k as number) || 10,
        namespace: input.namespace as string | undefined,
      });
    } catch (error) {
      return { error: `Search failed: ${error}` };
    }
  });

  router.register('agentic_fs_list', async (input) => {
    try {
      return await fs.listDirectory(
        (input.path as string) || 'root',
        input.namespace as string | undefined
      );
    } catch (error) {
      return { error: `List failed: ${error}` };
    }
  });
}
