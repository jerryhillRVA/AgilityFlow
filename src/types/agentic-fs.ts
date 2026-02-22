export interface FileUploadResponse {
  file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  indexing_status: string;
  message?: string;
}

export interface FileMetadata {
  file_id: string;
  tenant_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  custom_metadata: Record<string, unknown>;
  indexing_status: string;
  indexing_error?: string | null;
  namespace: string;
  path: string;
}

export interface BatchFileEntry {
  file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  namespace?: string | null;
  path: string;
  tags: string[];
  custom_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  indexing_status: string;
  content_type: 'text' | 'json' | 'binary' | 'error';
  content: string | Record<string, unknown> | unknown[] | null;
  download_url: string;
  truncated: boolean;
  error?: string | null;
}

export interface BatchRetrieveResponse {
  files: BatchFileEntry[];
  total_requested: number;
  total_found: number;
  total_errors: number;
}

export interface SearchHit {
  file_id: string;
  filename: string;
  score: number;
  chunk_text: string;
  chunk_idx: number;
  namespace?: string | null;
  path: string;
  metadata: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchHit[];
  query: string;
  total: number;
}

export interface RAGResponse {
  answer: string;
  sources: SearchHit[];
  query: string;
}

export interface DirEntry {
  name: string;
  type: 'file' | 'directory';
  path?: string | null;
  file_id?: string | null;
  size_bytes?: number | null;
  mime_type?: string | null;
  modified_at?: string | null;
}

export interface DirListResponse {
  tenant: string;
  path: string;
  entries: DirEntry[];
  total: number;
}

export interface IndexingStatusResponse {
  file_id: string;
  indexing_status: 'pending' | 'processing' | 'indexed' | 'failed';
  indexing_error?: string | null;
}

// ── Registry Hierarchy Types ──
// Stored in the _registry tenant under the knowledge namespace.
// See docs/data-model.md for the full schema reference.

export interface OrgMeta {
  id: string;
  name: string;
  portfolioIds: string[];
  createdAt: string;
}

export interface PortfolioMeta {
  id: string;
  name: string;
  orgId: string;
  projectIds: string[];
  createdAt: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  portfolioId: string;
  tenant: string;
  status: 'active' | 'archived';
  createdAt: string;
}
