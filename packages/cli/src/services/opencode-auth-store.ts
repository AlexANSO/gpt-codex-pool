import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

export interface OpenCodeOAuthAuth {
  type: 'oauth';
  access: string;
  refresh: string;
  expires: number; // Unix timestamp in milliseconds
}

export class OpenCodeAuthStore {
  private authPath: string;

  constructor() {
    this.authPath = join(homedir(), '.local/share/opencode/auth.json');
  }

  getAuthPath(): string {
    return this.authPath;
  }

  readConfig(): Record<string, unknown> {
    if (!existsSync(this.authPath)) {
      return {};
    }

    try {
      const content = readFileSync(this.authPath, 'utf8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Failed to parse auth.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  backupConfig(): string | null {
    if (!existsSync(this.authPath)) {
      return null;
    }

    const timestamp = Date.now();
    const backupPath = `${this.authPath}.bak.${timestamp}`;
    
    try {
      const content = readFileSync(this.authPath);
      writeFileSync(backupPath, content, { mode: 0o600 });
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to backup auth.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  writeOpenAIAuth(payload: OpenCodeOAuthAuth): { backupPath?: string } {
    // Ensure directory exists
    const dir = dirname(this.authPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    // Backup existing config
    const backupPath = this.backupConfig() || undefined;

    // Read existing config and update only 'openai' key
    const existing = this.readConfig();
    const newConfig = {
      ...existing,
      openai: payload
    };

    // Atomic write
    const tempPath = `${this.authPath}.tmp.${process.pid}`;
    
    try {
      writeFileSync(tempPath, JSON.stringify(newConfig, null, 2), { mode: 0o600 });
      renameSync(tempPath, this.authPath);
      chmodSync(this.authPath, 0o600);
      
      return { backupPath };
    } catch (error) {
      // Cleanup temp file if exists
      try {
        if (existsSync(tempPath)) {
          writeFileSync(tempPath, '');
        }
      } catch {}
      
      throw new Error(`Failed to write auth.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getCurrentAuthHash(): string | null {
    try {
      const config = this.readConfig();
      const openai = config.openai as OpenCodeOAuthAuth | undefined;
      
      if (!openai?.access) {
        return null;
      }
      
      return this.getAccessTokenHash(openai.access);
    } catch {
      return null;
    }
  }

  getAccessTokenHash(accessToken: string): string {
    return createHash('sha256').update(accessToken).digest('hex').slice(0, 16);
  }
}
