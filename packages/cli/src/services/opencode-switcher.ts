import { TokenValidator, type TokenValidationResult } from './token-validator.js';
import { OpenCodeAuthStore, type OpenCodeOAuthAuth } from './opencode-auth-store.js';
import { RotationStateStore, type RotationStrategy, type RotationState } from './rotation-state-store.js';
import { PoolManager } from '../utils/pool-manager.js';
import type { Account } from '@codex-pool/core';

export interface SwitchOptions {
  validate?: boolean;
  allowRefresh?: boolean;
  dryRun?: boolean;
  force?: boolean;
  minTtlMs?: number;
  strategy?: RotationStrategy;
  excludeAccountIds?: string[];
  purpose?: string;
  consumerId?: string;
}

export interface SwitchResult {
  accountId: string;
  accountEmail: string;
  authPath: string;
  backupPath?: string;
  refreshed: boolean;
  validated: boolean;
  expiresAt?: Date;
  quota?: {
    shortRemaining: number;
    longRemaining: number;
    codeReviewRemaining: number;
  };
}

export class OpenCodeSwitcher {
  private poolManager: PoolManager;
  private tokenValidator: TokenValidator;
  private authStore: OpenCodeAuthStore;
  private stateStore: RotationStateStore;

  constructor() {
    this.poolManager = new PoolManager();
    this.tokenValidator = new TokenValidator();
    this.authStore = new OpenCodeAuthStore();
    this.stateStore = new RotationStateStore();
  }

  async initialize(): Promise<void> {
    await this.poolManager.initialize();
  }

  async useAccount(accountId: string, options: SwitchOptions = {}): Promise<SwitchResult> {
    const { validate = true, allowRefresh = true, dryRun = false, force = false, minTtlMs = 120000 } = options;

    // Get account
    const account = this.poolManager.getAccount(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (account.status === 'disabled') {
      throw new Error(`Account ${accountId} is disabled`);
    }

    // Get credentials
    const credentials = await this.poolManager.getCredentials(accountId);
    if (!credentials?.accessToken) {
      throw new Error(`No credentials found for account ${accountId}`);
    }

    // Validate/refresh token
    let validation: TokenValidationResult;
    
    if (validate || !force) {
      validation = await this.tokenValidator.validateOrRefresh(accountId, credentials, {
        minTtlMs,
        allowRefresh,
      });

      if (validation.status === 'unauthorized') {
        if (!dryRun) {
          await this.poolManager.updateAccountStatus(accountId, 'reauth_required', 'Token validation failed');
        }
        throw new Error(`Account ${accountId} token is unauthorized. Please re-authenticate.`);
      }

      if (validation.status === 'rate_limited') {
        if (!dryRun) {
          await this.poolManager.updateAccountStatus(accountId, 'cooldown', 'Rate limited');
        }
        throw new Error(`Account ${accountId} is rate limited. Please try again later.`);
      }

      if (validation.status === 'network_error' || validation.status === 'server_error') {
        if (!force) {
          throw new Error(`Failed to validate account ${accountId}: ${validation.error}`);
        }
        // If force=true, proceed with existing token despite error
        validation = {
          status: 'valid',
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken,
          expiresAt: credentials.expiresAt,
        };
      }

      if (validation.status === 'refreshed' && validation.accessToken && !dryRun) {
        await this.poolManager.storeCredentials({
          ...credentials,
          accountId,
          accessToken: validation.accessToken,
          refreshToken: validation.refreshToken || credentials.refreshToken,
          expiresAt: validation.expiresAt || credentials.expiresAt,
        });
      }
    } else {
      validation = {
        status: 'valid',
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      };
    }

    if (!validation.accessToken || !validation.refreshToken || !validation.expiresAt) {
      throw new Error('Token validation returned incomplete data: missing accessToken, refreshToken, or expiresAt');
    }

    // Prepare OpenCode auth payload
    const authPayload: OpenCodeOAuthAuth = {
      type: 'oauth',
      access: validation.accessToken,
      refresh: validation.refreshToken,
      expires: validation.expiresAt.getTime(),
    };

    if (dryRun) {
      return {
        accountId,
        accountEmail: account.email,
        authPath: this.authStore.getAuthPath(),
        refreshed: validation.status === 'refreshed',
        validated: validation.status === 'valid' || validation.status === 'refreshed',
        expiresAt: validation.expiresAt,
        quota: validation.quota ? {
          shortRemaining: validation.quota.shortRemaining,
          longRemaining: validation.quota.longRemaining,
          codeReviewRemaining: validation.quota.codeReviewRemaining,
        } : undefined,
      };
    }

    // Acquire lock and write to OpenCode config
    return await this.stateStore.withLock(async () => {
      const { backupPath } = this.authStore.writeOpenAIAuth(authPayload);
      
      // Update state
      const authHash = this.authStore.getCurrentAuthHash() || '';
      await this.stateStore.setCurrentAccount(accountId, authHash);
      await this.stateStore.updateUsage(accountId);
      await this.stateStore.resetFailures(accountId);

      return {
        accountId,
        accountEmail: account.email,
        authPath: this.authStore.getAuthPath(),
        backupPath: backupPath || undefined,
        refreshed: validation.status === 'refreshed',
        validated: validation.status === 'valid' || validation.status === 'refreshed',
        expiresAt: validation.expiresAt,
        quota: validation.quota ? {
          shortRemaining: validation.quota.shortRemaining,
          longRemaining: validation.quota.longRemaining,
          codeReviewRemaining: validation.quota.codeReviewRemaining,
        } : undefined,
      };
    });
  }

  async rotate(options: SwitchOptions = {}): Promise<SwitchResult> {
    const { strategy = 'round-robin', excludeAccountIds = [] } = options;

    // Get all active accounts
    let accounts = this.poolManager.getAllAccounts().filter(
      a => (a.status === 'active' || a.status === 'degraded') && !excludeAccountIds.includes(a.id)
    );

    if (accounts.length === 0) {
      throw new Error('No active accounts available for rotation');
    }

    // Sort by strategy
    const state = await this.stateStore.load();
    accounts = this.sortByStrategy(accounts, state, strategy);

    // Try each account until one succeeds
    const errors: string[] = [];
    
    for (const account of accounts) {
      try {
        return await this.useAccount(account.id, options);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${account.id}: ${errMsg}`);
        await this.stateStore.recordFailure(account.id);
        
        // Continue to next account
        continue;
      }
    }

    throw new Error(`Rotation failed for all accounts:\n${errors.join('\n')}`);
  }

  async next(options: SwitchOptions = {}): Promise<SwitchResult> {
    const state = await this.stateStore.load();
    const currentId = state.currentAccountId;

    // Get active accounts
    let accounts = this.poolManager.getAllAccounts().filter(
      a => a.status === 'active' || a.status === 'degraded'
    );

    if (accounts.length === 0) {
      throw new Error('No active accounts available');
    }

    // Find current account index
    const currentIndex = accounts.findIndex(a => a.id === currentId);

    // Rotate to next account
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % accounts.length : 0;
    const nextAccount = accounts[nextIndex];

    return await this.useAccount(nextAccount.id, options);
  }

  async getCurrentAccount(): Promise<{
    account: Account | null;
    realEmail?: string;
    authInfo: {
      expiresAt?: Date;
      quota?: {
        shortRemaining: number;
        longRemaining: number;
        codeReviewRemaining: number;
      };
    };
    stateInfo: {
      lastSwitchedAt?: Date;
      totalSelections?: number;
    };
  } | null> {
    // Get current auth hash from OpenCode config
    const currentAuthHash = this.authStore.getCurrentAuthHash();
    if (!currentAuthHash) {
      return null;
    }

    // Get state to find matching account
    const state = await this.stateStore.load();

    // Find account by matching auth hash or currentAccountId
    let account: Account | null = null;

    if (state.currentAccountId) {
      account = this.poolManager.getAccount(state.currentAccountId) || null;
    }

    if (!account) {
      const accounts = this.poolManager.getAllAccounts();
      for (const acc of accounts) {
        try {
          const credentials = await this.poolManager.getCredentials(acc.id);
          if (credentials?.accessToken) {
            const hash = this.authStore.getCurrentAuthHash();
            if (hash === currentAuthHash) {
              account = acc;
              break;
            }
          }
        } catch {}
      }
    }

    const authConfig = this.authStore.readConfig();
    const openaiAuth = authConfig.openai as { access?: string; refresh?: string; expires?: string } | undefined;

    let realEmail: string | undefined;
    if (openaiAuth?.access) {
      try {
        const payload = JSON.parse(Buffer.from(openaiAuth.access.split('.')[1], 'base64').toString());
        realEmail = payload['https://api.openai.com/profile']?.email;
      } catch {}
    }

    let quota: TokenValidationResult['quota'] | undefined;
    
    if (account) {
      try {
        const credentials = await this.poolManager.getCredentials(account.id);
        if (credentials?.accessToken) {
          try {
            const validation = await this.tokenValidator.validateOrRefresh(account.id, credentials, {
              allowRefresh: false,
            });
            quota = validation.quota;
          } catch {}
        }
      } catch {}
    }
    
    if (!quota && openaiAuth?.access) {
      try {
        quota = await this.tokenValidator.fetchQuotaOnly(openaiAuth.access);
      } catch {}
    }

    // Get usage info from state
    let usageInfo: { totalSelections?: number; lastSwitchedAt?: Date } = {};
    if (account && state.usage[account.id]) {
      usageInfo = {
        totalSelections: state.usage[account.id].totalSelections,
        lastSwitchedAt: state.usage[account.id].lastSelectedAt
          ? new Date(state.usage[account.id].lastSelectedAt!)
          : undefined,
      };
    } else if (state.currentAccountId && state.usage[state.currentAccountId]) {
      usageInfo = {
        totalSelections: state.usage[state.currentAccountId].totalSelections,
        lastSwitchedAt: state.usage[state.currentAccountId].lastSelectedAt
          ? new Date(state.usage[state.currentAccountId].lastSelectedAt!)
          : undefined,
      };
    }

    return {
      account,
      realEmail,
      authInfo: {
        expiresAt: openaiAuth?.expires 
          ? new Date(openaiAuth.expires)
          : undefined,
        quota: quota
          ? {
              shortRemaining: quota.shortRemaining,
              longRemaining: quota.longRemaining,
              codeReviewRemaining: quota.codeReviewRemaining,
            }
          : undefined,
      },
      stateInfo: usageInfo,
    };
  }

  private sortByStrategy(
    accounts: Account[],
    state: RotationState,
    strategy: RotationStrategy
  ): Account[] {
    switch (strategy) {
      case 'round-robin':
        // Rotate starting from cursor
        const cursor = state.roundRobinCursor % accounts.length;
        return [...accounts.slice(cursor), ...accounts.slice(0, cursor)];

      case 'weighted': {
        // Smooth weighted round robin (SWRR)
        const sorted = [...accounts];
        sorted.sort((a, b) => {
          const weightA = a.status === 'degraded' 
            ? a.priorityWeight * 0.5 
            : a.priorityWeight;
          const weightB = b.status === 'degraded' 
            ? b.priorityWeight * 0.5 
            : b.priorityWeight;
          
          const currentA = (state.weightedCurrent[a.id] || 0) + weightA;
          const currentB = (state.weightedCurrent[b.id] || 0) + weightB;
          
          return currentB - currentA; // Descending
        });
        return sorted;
      }

      case 'least-used':
        return [...accounts].sort((a, b) => {
          const usageA = state.usage[a.id] || { window24hSelections: 0, lastSelectedAt: undefined };
          const usageB = state.usage[b.id] || { window24hSelections: 0, lastSelectedAt: undefined };
          
          // Sort by 24h usage, then last selected time
          if (usageA.window24hSelections !== usageB.window24hSelections) {
            return usageA.window24hSelections - usageB.window24hSelections;
          }
          
          const timeA = usageA.lastSelectedAt ? new Date(usageA.lastSelectedAt).getTime() : 0;
          const timeB = usageB.lastSelectedAt ? new Date(usageB.lastSelectedAt).getTime() : 0;
          return timeA - timeB;
        });

      default:
        return accounts;
    }
  }
}
