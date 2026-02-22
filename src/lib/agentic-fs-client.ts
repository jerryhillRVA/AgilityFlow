import type {
  FileUploadResponse,
  FileMetadata,
  BatchRetrieveResponse,
  SearchResponse,
  RAGResponse,
  DirListResponse,
  IndexingStatusResponse,
} from '@/types/agentic-fs';

export class AgenticFSClient {
  private baseUrl: string;
  private tenant: string;

  constructor(baseUrl?: string, tenant?: string) {
    this.baseUrl = baseUrl || process.env.AGENTIC_FS_URL || 'http://localhost:8000';
    this.tenant = tenant || process.env.AGENTIC_FS_TENANT || 'default';
  }

  private url(path: string): string {
    return `${this.baseUrl}/v1/${this.tenant}${path}`;
  }

  // ── File Operations ──

  async uploadFile(
    content: string,
    filename: string,
    options?: { namespace?: string; path?: string; tags?: string[] }
  ): Promise<FileUploadResponse> {
    const formData = new FormData();
    const blob = new Blob([content], { type: 'text/plain' });
    formData.append('file', blob, filename);
    if (options?.namespace) formData.append('namespace', options.namespace);
    if (options?.path) formData.append('path', options.path);
    if (options?.tags?.length) formData.append('tags', options.tags.join(','));

    const res = await fetch(this.url('/files'), { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async downloadFile(fileId: string): Promise<string> {
    const res = await fetch(this.url(`/files/${fileId}`));
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res.text();
  }

  async replaceFile(fileId: string, content: string, filename: string): Promise<FileUploadResponse> {
    const formData = new FormData();
    const blob = new Blob([content], { type: 'text/plain' });
    formData.append('file', blob, filename);
    const res = await fetch(this.url(`/files/${fileId}`), { method: 'PUT', body: formData });
    if (!res.ok) throw new Error(`Replace failed: ${res.status}`);
    return res.json();
  }

  async deleteFile(fileId: string): Promise<void> {
    const res = await fetch(this.url(`/files/${fileId}`), { method: 'DELETE' });
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  }

  async getFileMetadata(fileId: string): Promise<FileMetadata> {
    const res = await fetch(this.url(`/files/${fileId}/meta`));
    if (!res.ok) throw new Error(`Get metadata failed: ${res.status}`);
    return res.json();
  }

  async updateFileMetadata(
    fileId: string,
    update: { tags?: string[]; custom_metadata?: Record<string, unknown> }
  ): Promise<FileMetadata> {
    const res = await fetch(this.url(`/files/${fileId}/meta`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error(`Update metadata failed: ${res.status}`);
    return res.json();
  }

  async moveFile(fileId: string, newPath: string, newNamespace?: string): Promise<FileMetadata> {
    const res = await fetch(this.url(`/files/${fileId}/move`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_path: newPath, new_namespace: newNamespace }),
    });
    if (!res.ok) throw new Error(`Move failed: ${res.status}`);
    return res.json();
  }

  // ── Batch Operations ──

  async batchRetrieve(
    fileIds: string[],
    options?: { includeContent?: boolean; maxTextChars?: number }
  ): Promise<BatchRetrieveResponse> {
    const res = await fetch(this.url('/files/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_ids: fileIds,
        include_content: options?.includeContent ?? true,
        max_text_chars: options?.maxTextChars,
      }),
    });
    if (!res.ok) throw new Error(`Batch retrieve failed: ${res.status}`);
    return res.json();
  }

  // ── Directory Operations ──

  async createDirectory(path: string, namespace?: string): Promise<void> {
    const res = await fetch(this.url('/dirs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, namespace: namespace || 'default' }),
    });
    if (!res.ok) throw new Error(`Create dir failed: ${res.status}`);
  }

  async listDirectory(path: string, namespace?: string): Promise<DirListResponse> {
    const ns = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';
    const res = await fetch(this.url(`/dirs/${encodeURIComponent(path)}${ns}`));
    if (!res.ok) throw new Error(`List dir failed: ${res.status}`);
    return res.json();
  }

  // ── Search Operations ──

  async semanticSearch(
    query: string,
    options?: { k?: number; namespace?: string; path?: string }
  ): Promise<SearchResponse> {
    const res = await fetch(this.url('/search/semantic'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, k: options?.k || 10, namespace: options?.namespace, path: options?.path }),
    });
    if (!res.ok) throw new Error(`Semantic search failed: ${res.status}`);
    return res.json();
  }

  async hybridSearch(
    query: string,
    options?: { k?: number; namespace?: string; path?: string }
  ): Promise<SearchResponse> {
    const res = await fetch(this.url('/search/hybrid'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, k: options?.k || 10, namespace: options?.namespace, path: options?.path }),
    });
    if (!res.ok) throw new Error(`Hybrid search failed: ${res.status}`);
    return res.json();
  }

  async ask(
    query: string,
    options?: { k?: number; namespace?: string; path?: string; systemPrompt?: string }
  ): Promise<RAGResponse> {
    const res = await fetch(this.url('/search/ask'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        k: options?.k || 5,
        namespace: options?.namespace,
        path: options?.path,
        system_prompt: options?.systemPrompt,
      }),
    });
    if (!res.ok) throw new Error(`Ask failed: ${res.status}`);
    return res.json();
  }

  async getIndexingStatus(fileId: string): Promise<IndexingStatusResponse> {
    const res = await fetch(this.url(`/search/status/${fileId}`));
    if (!res.ok) throw new Error(`Indexing status failed: ${res.status}`);
    return res.json();
  }

  async waitForIndexing(fileId: string, maxWaitMs = 30000): Promise<IndexingStatusResponse> {
    const start = Date.now();
    let delay = 1000;
    while (Date.now() - start < maxWaitMs) {
      const status = await this.getIndexingStatus(fileId);
      if (status.indexing_status === 'indexed') return status;
      if (status.indexing_status === 'failed') throw new Error(`Indexing failed: ${status.indexing_error}`);
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 5000);
    }
    throw new Error('Indexing timed out');
  }

  // ── Health ──

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  }
}

let client: AgenticFSClient | null = null;
export function getAgenticFSClient(): AgenticFSClient {
  if (!client) client = new AgenticFSClient();
  return client;
}
