import type { CodexQuota, CodexSession } from '../types';

export class CodexQuotaParser {
  parseFromSessionArtifacts(artifacts: Record<string, unknown>): CodexQuota | null {
    try {
      const shortWindow = this.parseWindow(artifacts, 'short');
      const longWindow = this.parseWindow(artifacts, 'long');
      
      if (!shortWindow || !longWindow) {
        return null;
      }

      return {
        shortWindow,
        longWindow,
        tier: this.detectTier(artifacts),
        modelLimits: this.parseModelLimits(artifacts)
      };
    } catch {
      return null;
    }
  }

  parseFromResponseHeaders(headers: Record<string, string>): Partial<CodexQuota> {
    const quota: Partial<CodexQuota> = {};

    const remaining = headers['x-ratelimit-remaining-requests'];
    const limit = headers['x-ratelimit-limit-requests'];
    const reset = headers['x-ratelimit-reset-requests'];

    if (remaining && limit) {
      const used = parseInt(limit) - parseInt(remaining);
      const remainingNum = parseInt(remaining);
      let resetAt: Date;

      if (reset) {
        const resetTimestamp = parseInt(reset);
        resetAt = isNaN(resetTimestamp) ? new Date() : new Date(resetTimestamp * 1000);
      } else {
        resetAt = new Date();
      }

      quota.shortWindow = {
        used: isNaN(used) ? 0 : used,
        remaining: isNaN(remainingNum) ? 0 : remainingNum,
        resetAt
      };
    }

    return quota;
  }

  private parseWindow(
    artifacts: Record<string, unknown>,
    type: 'short' | 'long'
  ): { used: number; remaining: number; resetAt: Date } | null {
    const prefix = type === 'short' ? 'primary' : 'secondary';
    
    const used = artifacts[`${prefix}_used`];
    const remaining = artifacts[`${prefix}_remaining`];
    const resetAt = artifacts[`${prefix}_reset_at`];

    if (typeof used !== 'number' || typeof remaining !== 'number') {
      return null;
    }

    let resetAtDate: Date;
    if (resetAt && typeof resetAt === 'string') {
      const parsed = new Date(resetAt);
      resetAtDate = isNaN(parsed.getTime()) ? new Date(Date.now() + 3600000) : parsed;
    } else if (resetAt && typeof resetAt === 'number') {
      resetAtDate = new Date(resetAt);
    } else {
      resetAtDate = new Date(Date.now() + 3600000);
    }

    return {
      used,
      remaining,
      resetAt: resetAtDate
    };
  }

  private detectTier(artifacts: Record<string, unknown>): 'plus' | 'pro' | 'plus' {
    const tier = artifacts['subscription_tier'];
    if (tier === 'pro') return 'pro';
    return 'plus';
  }

  private parseModelLimits(artifacts: Record<string, unknown>): Record<string, { used: number; remaining: number }> | undefined {
    const modelLimits = artifacts['model_limits'];
    if (typeof modelLimits !== 'object' || modelLimits === null) {
      return undefined;
    }

    const result: Record<string, { used: number; remaining: number }> = {};
    
    for (const [model, data] of Object.entries(modelLimits)) {
      if (typeof data === 'object' && data !== null) {
        const used = (data as Record<string, number>)['used'];
        const remaining = (data as Record<string, number>)['remaining'];
        
        if (typeof used === 'number' && typeof remaining === 'number') {
          result[model] = { used, remaining };
        }
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }
}

export function isQuotaExhausted(quota: CodexQuota): boolean {
  return quota.shortWindow.remaining <= 0 || quota.longWindow.remaining <= 0;
}

export function getQuotaStatus(quota: CodexQuota): {
  status: 'healthy' | 'warning' | 'critical';
  message: string;
} {
  const shortRatio = quota.shortWindow.remaining / (quota.shortWindow.used + quota.shortWindow.remaining);
  const longRatio = quota.longWindow.remaining / (quota.longWindow.used + quota.longWindow.remaining);

  if (shortRatio < 0.1 || longRatio < 0.1) {
    return {
      status: 'critical',
      message: `Critical: Short ${Math.round(shortRatio * 100)}%, Long ${Math.round(longRatio * 100)}% remaining`
    };
  }

  if (shortRatio < 0.3 || longRatio < 0.3) {
    return {
      status: 'warning',
      message: `Warning: Short ${Math.round(shortRatio * 100)}%, Long ${Math.round(longRatio * 100)}% remaining`
    };
  }

  return {
    status: 'healthy',
    message: `Healthy: Short ${Math.round(shortRatio * 100)}%, Long ${Math.round(longRatio * 100)}% remaining`
  };
}
