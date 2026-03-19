import { existsSync, readFileSync, writeFileSync, mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from '../utils/paths.js';

export type RotationStrategy = 'round-robin' | 'weighted' | 'least-used';

export interface RotationState {
  version: 1;
  currentAccountId?: string;
  currentAuthHash?: string;
  roundRobinCursor: number;
  weightedCurrent: Record<string, number>;
  usage: Record<string, {
    totalSelections: number;
    window24hSelections: number;
    windowStartedAt: string;
    lastSelectedAt?: string;
    consecutiveFailures: number;
  }>;
}

const STATE_FILE = 'opencode-state.json';
const LOCK_DIR = '.opencode-switch.lock';

export class RotationStateStore {
  private statePath: string;
  private lockPath: string;

  constructor() {
    const dataDir = getDataDir();
    this.statePath = join(dataDir, STATE_FILE);
    this.lockPath = join(dataDir, LOCK_DIR);
  }

  async load(): Promise<RotationState> {
    if (!existsSync(this.statePath)) {
      return this.getDefaultState();
    }

    try {
      const content = readFileSync(this.statePath, 'utf8');
      const parsed = JSON.parse(content) as RotationState;
      
      // Validate version
      if (parsed.version !== 1) {
        return this.getDefaultState();
      }
      
      return parsed;
    } catch {
      return this.getDefaultState();
    }
  }

  async save(state: RotationState): Promise<void> {
    const tempPath = `${this.statePath}.tmp.${process.pid}`;
    
    try {
      writeFileSync(tempPath, JSON.stringify(state, null, 2), { mode: 0o600 });
      writeFileSync(this.statePath, readFileSync(tempPath));
    } finally {
      try {
        if (existsSync(tempPath)) {
          writeFileSync(tempPath, '');
        }
      } catch {}
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    // Try to acquire lock
    const maxAttempts = 50;
    const delayMs = 100;
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        mkdirSync(this.lockPath, { mode: 0o700 });
        break;
      } catch {
        // Lock exists, wait and retry
        if (i === maxAttempts - 1) {
          throw new Error('Could not acquire lock for account switch');
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    try {
      return await fn();
    } finally {
      try {
        rmdirSync(this.lockPath);
      } catch {}
    }
  }

  async updateUsage(accountId: string): Promise<void> {
    const state = await this.load();
    const now = new Date().toISOString();
    
    if (!state.usage[accountId]) {
      state.usage[accountId] = {
        totalSelections: 0,
        window24hSelections: 0,
        windowStartedAt: now,
        consecutiveFailures: 0,
      };
    }

    const usage = state.usage[accountId];
    usage.totalSelections++;
    usage.lastSelectedAt = now;

    // Check if 24h window has passed
    const windowStart = new Date(usage.windowStartedAt);
    const hoursSinceWindowStart = (Date.now() - windowStart.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceWindowStart >= 24) {
      usage.window24hSelections = 1;
      usage.windowStartedAt = now;
    } else {
      usage.window24hSelections++;
    }

    await this.save(state);
  }

  async recordFailure(accountId: string): Promise<void> {
    const state = await this.load();
    
    if (!state.usage[accountId]) {
      return;
    }

    state.usage[accountId].consecutiveFailures++;
    await this.save(state);
  }

  async resetFailures(accountId: string): Promise<void> {
    const state = await this.load();
    
    if (state.usage[accountId]) {
      state.usage[accountId].consecutiveFailures = 0;
      await this.save(state);
    }
  }

  async advanceRoundRobin(totalAccounts: number): Promise<void> {
    const state = await this.load();
    state.roundRobinCursor = (state.roundRobinCursor + 1) % totalAccounts;
    await this.save(state);
  }

  async setCurrentAccount(accountId: string, authHash: string): Promise<void> {
    const state = await this.load();
    state.currentAccountId = accountId;
    state.currentAuthHash = authHash;
    await this.save(state);
  }

  private getDefaultState(): RotationState {
    return {
      version: 1,
      roundRobinCursor: 0,
      weightedCurrent: {},
      usage: {},
    };
  }
}
