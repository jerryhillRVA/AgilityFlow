import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSettingsService } from '../settings-service';
import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NS } from '../fs-paths';
import { eventBus } from '../events/emitter';
import { createEvent } from '../events/types';

const execFileAsync = promisify(execFile);

/** File extensions worth indexing for code search/RAG */
const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml',
  '.css', '.html', '.sql', '.sh', '.dockerfile',
]);

/** Directories to skip during indexing */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.turbo', 'coverage', '.nyc_output', '.agility',
]);

/** Max file size to index (100KB) */
const MAX_FILE_SIZE = 100 * 1024;

export class GitHubConnector {
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  /** Initialize the connector on startup */
  async initialize(): Promise<void> {
    const settings = getSettingsService();
    const config = (await settings.load()).connectors.github;

    if (!config.repoUrl || !config.patConfigured) {
      settings.setGitHubRuntimeStatus({ status: 'disconnected' });
      return;
    }

    try {
      settings.setGitHubRuntimeStatus({ status: 'syncing' });

      const cloneDir = this.resolveClonePath(config.clonePath, config.repoUrl);
      const cloneExists = await this.isGitRepo(cloneDir);

      if (!cloneExists) {
        await this.clone(config.repoUrl, config.branch, cloneDir);
      } else {
        await this.pull(cloneDir, config.branch);
      }

      // Index all eligible files to Agentic FS code namespace
      const indexedCount = await this.indexToAgenticFS(cloneDir);

      // Persist sync timestamp so subsequent sync() calls use incremental logic
      const now = new Date().toISOString();
      await settings.updateLastSyncedAt(now);

      settings.setGitHubRuntimeStatus({
        status: 'connected',
        lastSyncAt: now,
        filesIndexed: indexedCount,
      });

      eventBus.emit(createEvent(
        'system:info',
        `GitHub connector: ${cloneExists ? 'pulled' : 'cloned'} ${config.repoUrl}, indexed ${indexedCount} files`,
        { repoUrl: config.repoUrl, filesIndexed: indexedCount },
      ));

      // Start background sync if enabled
      if (config.autoSync && config.syncIntervalMinutes > 0) {
        this.startBackgroundSync(config.syncIntervalMinutes);
      }
    } catch (error) {
      settings.setGitHubRuntimeStatus({
        status: 'error',
        lastError: String(error),
      });
      eventBus.emit(createEvent(
        'system:error',
        `GitHub connector init failed: ${String(error)}`,
        { error: String(error) },
      ));
    }
  }

  /** Manual or scheduled sync — uses persisted lastSyncedAt for incremental indexing */
  async sync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;

    const settings = getSettingsService();
    settings.setGitHubRuntimeStatus({ status: 'syncing' });

    try {
      const config = (await settings.load()).connectors.github;
      if (!config.repoUrl || !config.patConfigured) {
        settings.setGitHubRuntimeStatus({ status: 'disconnected' });
        return;
      }

      const cloneDir = this.resolveClonePath(config.clonePath, config.repoUrl);

      if (!await this.isGitRepo(cloneDir)) {
        // Clone hasn't happened yet — do a full init
        await this.clone(config.repoUrl, config.branch, cloneDir);
        const indexedCount = await this.indexToAgenticFS(cloneDir);
        const now = new Date().toISOString();
        await settings.updateLastSyncedAt(now);
        settings.setGitHubRuntimeStatus({
          status: 'connected',
          lastSyncAt: now,
          filesIndexed: indexedCount,
        });
        return;
      }

      // Pull latest changes
      await this.pull(cloneDir, config.branch);

      const lastSyncedAt = config.lastSyncedAt;

      if (!lastSyncedAt) {
        // No persisted timestamp — full re-index to establish baseline
        const indexedCount = await this.indexToAgenticFS(cloneDir);
        const now = new Date().toISOString();
        await settings.updateLastSyncedAt(now);
        settings.setGitHubRuntimeStatus({
          status: 'connected',
          lastSyncAt: now,
          filesIndexed: indexedCount,
        });
        eventBus.emit(createEvent(
          'system:info',
          `GitHub sync: full re-index (no prior timestamp), ${indexedCount} files indexed`,
          { filesIndexed: indexedCount },
        ));
        return;
      }

      // Incremental sync: get files changed since last sync timestamp
      const changedFiles = await this.getFilesSince(cloneDir, lastSyncedAt);
      const now = new Date().toISOString();

      if (changedFiles.length > 0) {
        const indexedCount = await this.indexFiles(cloneDir, changedFiles);
        await settings.updateLastSyncedAt(now);

        eventBus.emit(createEvent(
          'system:info',
          `GitHub sync: ${changedFiles.length} changed, ${indexedCount} indexed`,
          { filesChanged: changedFiles.length, filesIndexed: indexedCount },
        ));

        settings.setGitHubRuntimeStatus({
          status: 'connected',
          lastSyncAt: now,
          filesIndexed: indexedCount,
        });
      } else {
        // No changes — advance the cursor
        await settings.updateLastSyncedAt(now);
        settings.setGitHubRuntimeStatus({
          status: 'connected',
          lastSyncAt: now,
        });
      }
    } catch (error) {
      settings.setGitHubRuntimeStatus({
        status: 'error',
        lastError: String(error),
      });
      eventBus.emit(createEvent(
        'system:error',
        `GitHub sync error: ${String(error)}`,
        { error: String(error) },
      ));
    } finally {
      this.syncing = false;
    }
  }

  /** Clone the repo with PAT auth */
  private async clone(repoUrl: string, branch: string, cloneDir: string): Promise<void> {
    const pat = await getSettingsService().getDecryptedPAT();
    if (!pat) throw new Error('GitHub PAT not configured');

    const authedUrl = this.injectPATIntoUrl(repoUrl, pat);
    await fs.mkdir(path.dirname(cloneDir), { recursive: true });

    await execFileAsync('git', [
      'clone', '--branch', branch, '--single-branch',
      authedUrl, cloneDir,
    ], { timeout: 300000 });

    // Remove PAT from stored remote URL (security hygiene)
    await execFileAsync('git', [
      '-C', cloneDir, 'remote', 'set-url', 'origin', repoUrl,
    ], { timeout: 10000 });

    eventBus.emit(createEvent(
      'system:info',
      `GitHub: cloned ${repoUrl} (branch: ${branch})`,
      { repoUrl, branch },
    ));
  }

  /** Pull latest changes */
  private async pull(cloneDir: string, branch: string): Promise<void> {
    const pat = await getSettingsService().getDecryptedPAT();
    if (!pat) throw new Error('GitHub PAT not configured');

    const config = (await getSettingsService().load()).connectors.github;
    const authedUrl = this.injectPATIntoUrl(config.repoUrl, pat);

    // Temporarily set authed URL for pull
    await execFileAsync('git', [
      '-C', cloneDir, 'remote', 'set-url', 'origin', authedUrl,
    ], { timeout: 10000 });

    await execFileAsync('git', [
      '-C', cloneDir, 'pull', 'origin', branch,
    ], { timeout: 300000 });

    // Remove PAT from remote URL after pull
    await execFileAsync('git', [
      '-C', cloneDir, 'remote', 'set-url', 'origin', config.repoUrl,
    ], { timeout: 10000 });
  }

  /** Index all eligible files to Agentic FS code namespace */
  private async indexToAgenticFS(cloneDir: string): Promise<number> {
    const files = await this.walkDirectory(cloneDir);
    return this.indexFiles(cloneDir, files);
  }

  /** Index specific files to Agentic FS, returns count of indexed files */
  private async indexFiles(cloneDir: string, filePaths: string[]): Promise<number> {
    const client = getAgenticFSClient();
    let indexed = 0;

    for (const filePath of filePaths) {
      try {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cloneDir, filePath);
        const stat = await fs.stat(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;

        const ext = path.extname(fullPath).toLowerCase();
        if (!INDEXABLE_EXTENSIONS.has(ext)) continue;

        const content = await fs.readFile(fullPath, 'utf8');
        const relativePath = path.relative(cloneDir, fullPath);
        const dir = path.dirname(relativePath);

        await client.uploadFile(content, path.basename(fullPath), {
          namespace: NS.CODE,
          path: dir === '.' ? '' : dir,
          tags: ['code', ext.slice(1)],
        });
        indexed++;
      } catch {
        // Skip files that fail to read or upload
      }
    }

    return indexed;
  }

  /** Walk directory tree, collecting indexable file paths */
  private async walkDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];

    async function walk(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            await walk(path.join(currentDir, entry.name));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (INDEXABLE_EXTENSIONS.has(ext)) {
            files.push(path.join(currentDir, entry.name));
          }
        }
      }
    }

    await walk(dir);
    return files;
  }

  /** Get all files changed since a given ISO timestamp, deduplicated */
  private async getFilesSince(cloneDir: string, since: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('git', [
        '-C', cloneDir,
        'log',
        `--since=${since}`,
        '--name-only',
        '--pretty=format:',
        '--diff-filter=ACMR',
      ], { timeout: 30000 });

      const files = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

      // Deduplicate: same file may appear in multiple commits
      return [...new Set(files)];
    } catch {
      // Fallback: re-index everything
      return this.walkDirectory(cloneDir);
    }
  }

  /** Check if a directory is a git repo */
  private async isGitRepo(dir: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  /** Insert PAT into HTTPS GitHub URL for authentication */
  private injectPATIntoUrl(repoUrl: string, pat: string): string {
    return repoUrl.replace('https://', `https://${pat}@`);
  }

  /** Resolve clone path from config */
  private resolveClonePath(basePath: string, repoUrl: string): string {
    const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
    return path.join(process.cwd(), basePath, repoName);
  }

  /** Get the resolved clone directory for external use */
  async getCloneDir(): Promise<string | null> {
    const config = (await getSettingsService().load()).connectors.github;
    if (!config.repoUrl) return null;
    const dir = this.resolveClonePath(config.clonePath, config.repoUrl);
    if (await this.isGitRepo(dir)) return dir;
    return null;
  }

  /** Start periodic background sync */
  private startBackgroundSync(intervalMinutes: number): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(
      () => { this.sync().catch(() => {}); },
      intervalMinutes * 60 * 1000,
    );
  }

  /** Stop background sync */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

// Singleton via globalThis
const connectorKey = '__agilityflow_github_connector__' as const;
export function getGitHubConnector(): GitHubConnector {
  let connector = (globalThis as Record<string, unknown>)[connectorKey] as GitHubConnector | undefined;
  if (!connector) {
    connector = new GitHubConnector();
    (globalThis as Record<string, unknown>)[connectorKey] = connector;
  }
  return connector;
}
