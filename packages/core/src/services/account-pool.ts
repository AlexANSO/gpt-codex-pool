import type { Account, AccountStatus, HealthCheck, QuotaSnapshot, Lease, PoolConfig } from '../types';
import { DEFAULT_POOL_CONFIG } from '../types';

export class AccountPool {
  private accounts: Map<string, Account> = new Map();
  private healthChecks: Map<string, HealthCheck[]> = new Map();
  private quotas: Map<string, QuotaSnapshot[]> = new Map();
  private leases: Map<string, Lease> = new Map();
  private config: PoolConfig;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  addAccount(account: Account): void {
    this.accounts.set(account.id, account);
  }

  getAccount(id: string): Account | undefined {
    return this.accounts.get(id);
  }

  getAllAccounts(): Account[] {
    return Array.from(this.accounts.values());
  }

  getActiveAccounts(): Account[] {
    return this.getAllAccounts().filter(a => 
      a.status === 'active' || a.status === 'degraded'
    );
  }

  getHealthyAccounts(): Account[] {
    const now = new Date();
    return this.getActiveAccounts().filter(a => {
      if (a.cooldownUntil && a.cooldownUntil > now) return false;
      if (a.healthScore < 50) return false;
      return true;
    });
  }

  updateAccountStatus(id: string, status: AccountStatus, reason?: string): void {
    const account = this.accounts.get(id);
    if (!account) throw new Error(`Account ${id} not found`);
    
    account.status = status;
    account.updatedAt = new Date();
    
    if (reason) {
      account.notes = reason;
    }
  }

  setCooldown(id: string, durationMs?: number): void {
    const account = this.accounts.get(id);
    if (!account) throw new Error(`Account ${id} not found`);
    
    const cooldownMs = durationMs || this.config.defaultCooldownMs;
    account.cooldownUntil = new Date(Date.now() + cooldownMs);
    account.status = 'cooldown';
    account.updatedAt = new Date();
  }

  recordHealthCheck(check: HealthCheck): void {
    const checks = this.healthChecks.get(check.accountId) || [];
    checks.push(check);
    
    if (checks.length > 100) {
      checks.shift();
    }
    
    this.healthChecks.set(check.accountId, checks);
    
    const account = this.accounts.get(check.accountId);
    if (account) {
      account.lastHealthCheckAt = check.checkedAt;
      account.healthScore = this.calculateHealthScore(checks);
      
      if (check.status === 'unhealthy') {
        account.status = 'degraded';
      }
    }
  }

  recordQuotaSnapshot(snapshot: QuotaSnapshot): void {
    const snapshots = this.quotas.get(snapshot.accountId) || [];
    snapshots.push(snapshot);
    
    if (snapshots.length > 50) {
      snapshots.shift();
    }
    
    this.quotas.set(snapshot.accountId, snapshots);
    
    const account = this.accounts.get(snapshot.accountId);
    if (account) {
      account.lastProbeAt = snapshot.capturedAt;
    }
  }

  acquireLease(accountId: string, consumerId: string, purpose: string): Lease | null {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    
    const activeLeases = this.getActiveLeasesForAccount(accountId);
    if (activeLeases.length >= this.config.maxLeasesPerAccount) {
      return null;
    }

    const lease: Lease = {
      id: `lease_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      accountId,
      consumerId,
      purpose,
      status: 'active',
      startedAt: new Date(),
      lastHeartbeatAt: new Date()
    };

    this.leases.set(lease.id, lease);
    return lease;
  }

  releaseLease(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.status !== 'active') return false;
    
    lease.status = 'released';
    lease.endedAt = new Date();
    return true;
  }

  heartbeatLease(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.status !== 'active') return false;
    
    lease.lastHeartbeatAt = new Date();
    return true;
  }

  cleanupExpiredLeases(): number {
    const now = new Date();
    let cleaned = 0;
    
    for (const lease of this.leases.values()) {
      if (lease.status !== 'active') continue;
      
      const elapsed = now.getTime() - lease.lastHeartbeatAt.getTime();
      if (elapsed > this.config.leaseTimeoutMs) {
        lease.status = 'expired';
        lease.endedAt = now;
        cleaned++;
      }
    }
    
    return cleaned;
  }

  selectAccountForRequest(preferredAccountId?: string): Account | null {
    if (preferredAccountId) {
      const account = this.accounts.get(preferredAccountId);
      if (account && this.isAccountAvailable(account)) {
        return account;
      }
    }

    const available = this.getHealthyAccounts().filter(a => {
      const leases = this.getActiveLeasesForAccount(a.id);
      return leases.length < this.config.maxLeasesPerAccount;
    });

    if (available.length === 0) return null;

    switch (this.config.rotationStrategy) {
      case 'round-robin':
        return this.selectRoundRobin(available);
      case 'least-used':
        return this.selectLeastUsed(available);
      case 'weighted':
      default:
        return this.selectWeighted(available);
    }
  }

  private isAccountAvailable(account: Account): boolean {
    if (account.status !== 'active' && account.status !== 'degraded') return false;
    if (account.cooldownUntil && account.cooldownUntil > new Date()) return false;
    return true;
  }

  private getActiveLeasesForAccount(accountId: string): Lease[] {
    return Array.from(this.leases.values()).filter(
      l => l.accountId === accountId && l.status === 'active'
    );
  }

  private calculateHealthScore(checks: HealthCheck[]): number {
    if (checks.length === 0) return 100;
    
    const recent = checks.slice(-10);
    const healthy = recent.filter(c => c.status === 'healthy').length;
    return Math.round((healthy / recent.length) * 100);
  }

  private roundRobinIndex = 0;

  private selectRoundRobin(accounts: Account[]): Account {
    const account = accounts[this.roundRobinIndex % accounts.length];
    this.roundRobinIndex++;
    return account;
  }

  private selectLeastUsed(accounts: Account[]): Account {
    return accounts.sort((a, b) => {
      const leasesA = this.getActiveLeasesForAccount(a.id).length;
      const leasesB = this.getActiveLeasesForAccount(b.id).length;
      return leasesA - leasesB;
    })[0];
  }

  private selectWeighted(accounts: Account[]): Account {
    const totalWeight = accounts.reduce((sum, a) => sum + a.priorityWeight, 0);
    let random = Math.random() * totalWeight;
    
    for (const account of accounts) {
      random -= account.priorityWeight;
      if (random <= 0) return account;
    }
    
    return accounts[accounts.length - 1];
  }

  getStats(): {
    totalAccounts: number;
    activeAccounts: number;
    healthyAccounts: number;
    activeLeases: number;
  } {
    return {
      totalAccounts: this.accounts.size,
      activeAccounts: this.getActiveAccounts().length,
      healthyAccounts: this.getHealthyAccounts().length,
      activeLeases: Array.from(this.leases.values()).filter(l => l.status === 'active').length
    };
  }
}
