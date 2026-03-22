import { AccountPool, CredentialStorage, type Account, type AccountCredentials, type Lease } from '@codex-pool/core';
import { getDataDir, getCredentialsDir } from './paths.js';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const ACCOUNTS_FILE = 'accounts.json';

export class PoolManager {
  private pool: AccountPool;
  private storage: CredentialStorage;
  private dataDir: string;

  constructor() {
    this.dataDir = getDataDir();
    this.pool = new AccountPool();
    this.storage = new CredentialStorage({
      storageDir: getCredentialsDir(),
      masterKeyEnvVar: 'CODEX_POOL_MASTER_KEY'
    });
    
    this.loadAccounts();
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();
    this.cleanupExpiredLeases();
  }

  private loadAccounts(): void {
    const accountsPath = join(this.dataDir, ACCOUNTS_FILE);
    if (existsSync(accountsPath)) {
      try {
        const data = JSON.parse(readFileSync(accountsPath, 'utf8'));
        for (const acc of data.accounts || []) {
          this.pool.addAccount({
            ...acc,
            createdAt: new Date(acc.createdAt),
            updatedAt: new Date(acc.updatedAt),
            cooldownUntil: acc.cooldownUntil ? new Date(acc.cooldownUntil) : undefined,
            lastLoginAt: acc.lastLoginAt ? new Date(acc.lastLoginAt) : undefined,
            lastProbeAt: acc.lastProbeAt ? new Date(acc.lastProbeAt) : undefined,
            lastHealthCheckAt: acc.lastHealthCheckAt ? new Date(acc.lastHealthCheckAt) : undefined
          });
        }

        for (const lease of data.leases || []) {
          this.pool.restoreLease({
            ...lease,
            startedAt: new Date(lease.startedAt),
            lastHeartbeatAt: new Date(lease.lastHeartbeatAt),
            endedAt: lease.endedAt ? new Date(lease.endedAt) : undefined,
          });
        }
      } catch (error) {
        console.error(`Failed to load accounts from ${accountsPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private saveAccounts(): void {
    const accountsPath = join(this.dataDir, ACCOUNTS_FILE);
    const tempPath = `${accountsPath}.tmp.${process.pid}`;
    const data = {
      accounts: this.pool.getAllAccounts().map(a => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        cooldownUntil: a.cooldownUntil?.toISOString(),
        lastLoginAt: a.lastLoginAt?.toISOString(),
        lastProbeAt: a.lastProbeAt?.toISOString(),
        lastHealthCheckAt: a.lastHealthCheckAt?.toISOString()
      })),
      leases: this.pool.getAllLeases().map(lease => ({
        ...lease,
        startedAt: lease.startedAt.toISOString(),
        lastHeartbeatAt: lease.lastHeartbeatAt.toISOString(),
        endedAt: lease.endedAt?.toISOString(),
      }))
    };

    try {
      writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      renameSync(tempPath, accountsPath);
    } catch (error) {
      try {
        if (existsSync(tempPath)) {
          writeFileSync(tempPath, '');
        }
      } catch {}
      throw error;
    }
  }

  addAccount(account: Account): void {
    this.pool.addAccount(account);
    this.saveAccounts();
  }

  getAccount(id: string): Account | undefined {
    return this.pool.getAccount(id);
  }

  getAllAccounts(): Account[] {
    return this.pool.getAllAccounts();
  }

  updateAccountStatus(id: string, status: Account['status'], reason?: string): void {
    this.pool.updateAccountStatus(id, status, reason);
    this.saveAccounts();
  }

  setCooldown(id: string, durationMs?: number): void {
    this.pool.setCooldown(id, durationMs);
    this.saveAccounts();
  }

  async storeCredentials(credentials: AccountCredentials): Promise<void> {
    await this.storage.storeCredentials(credentials);
    const account = this.pool.getAccount(credentials.accountId);
    if (account) {
      account.lastLoginAt = new Date();
      account.status = 'active';
      this.saveAccounts();
    }
  }

  async getCredentials(accountId: string): Promise<AccountCredentials | null> {
    return await this.storage.retrieveCredentials(accountId);
  }

  async removeAccount(id: string): Promise<boolean> {
    await this.storage.deleteCredentials(id);
    const removed = this.pool.removeAccount(id);

    if (!removed) {
      return false;
    }

    try {
      this.saveAccounts();
      return true;
    } catch (error) {
      console.error(`Failed to update accounts file: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  acquireLease(accountId: string, consumerId: string, purpose: string): Lease | null {
    const lease = this.pool.acquireLease(accountId, consumerId, purpose);

    if (lease) {
      this.saveAccounts();
    }

    return lease;
  }

  releaseLease(leaseId: string): boolean {
    const released = this.pool.releaseLease(leaseId);

    if (released) {
      this.saveAccounts();
    }

    return released;
  }

  getAllLeases(): Lease[] {
    return this.pool.getAllLeases();
  }

  cleanupExpiredLeases(): number {
    const cleaned = this.pool.cleanupExpiredLeases();

    if (cleaned > 0) {
      this.saveAccounts();
    }

    return cleaned;
  }

  getPool(): AccountPool {
    return this.pool;
  }

  getStats() {
    return this.pool.getStats();
  }
}
