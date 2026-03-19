/**
 * Account Types - Core domain types for Codex Account Pool
 */

export type AccountStatus = 
  | 'draft'           // 刚创建，未登录
  | 'active'          // 正常可用
  | 'cooldown'        // 触发速率限制，冷却中
  | 'degraded'        // 性能下降但仍可用
  | 'reauth_required' // 需要重新认证
  | 'disabled';       // 手动禁用

export type PlanTier = 'plus' | 'pro' | 'unknown';

export interface Account {
  id: string;
  label: string;
  email: string;
  provider: 'chatgpt';
  planTier: PlanTier;
  status: AccountStatus;
  priorityWeight: number;      // 优先级权重 (1-10)
  healthScore: number;         // 健康分数 (0-100)
  cooldownUntil?: Date;        // 冷却结束时间
  lastLoginAt?: Date;
  lastProbeAt?: Date;
  lastHealthCheckAt?: Date;
  notes?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountCredentials {
  accountId: string;
  storageState: string;        // Playwright storage state (encrypted)
  accessToken?: string;        // OAuth access token (encrypted)
  refreshToken?: string;       // OAuth refresh token (encrypted)
  sessionCookies: Record<string, string>; // 关键 cookies (encrypted)
  expiresAt?: Date;
  createdAt: Date;
}

export interface QuotaSnapshot {
  id: string;
  accountId: string;
  capturedAt: Date;
  windowType: 'short' | 'long' | 'daily' | 'weekly';
  requestsUsed: number;
  requestsRemaining: number;
  resetAt?: Date;
  limitHeaders?: Record<string, string>;
  rawData?: Record<string, unknown>;
}

export interface HealthCheck {
  id: string;
  accountId: string;
  checkedAt: Date;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  quotaStatus?: QuotaSnapshot;
}

export interface Lease {
  id: string;
  accountId: string;
  consumerId: string;
  purpose: string;
  status: 'active' | 'released' | 'expired';
  startedAt: Date;
  lastHeartbeatAt: Date;
  endedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface LoginRun {
  id: string;
  accountId: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: Date;
  endedAt?: Date;
  browserSessionId?: string;
  errorMessage?: string;
}

export interface PoolConfig {
  maxLeasesPerAccount: number;
  leaseTimeoutMs: number;
  healthCheckIntervalMs: number;
  quotaCheckIntervalMs: number;
  defaultCooldownMs: number;
  rotationStrategy: 'round-robin' | 'weighted' | 'least-used';
}

export const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxLeasesPerAccount: 5,
  leaseTimeoutMs: 5 * 60 * 1000,        // 5 minutes
  healthCheckIntervalMs: 60 * 1000,      // 1 minute
  quotaCheckIntervalMs: 5 * 60 * 1000,   // 5 minutes
  defaultCooldownMs: 60 * 60 * 1000,     // 1 hour
  rotationStrategy: 'weighted'
};
