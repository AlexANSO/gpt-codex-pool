import { refreshAccessToken } from '@codex-pool/browser';
import type { AccountCredentials } from '@codex-pool/core';

const WHAM_API_URL = 'https://chatgpt.com/backend-api/wham/usage';

export interface TokenValidationResult {
  status:
    | 'valid'
    | 'refreshed'
    | 'unauthorized'
    | 'expired'
    | 'rate_limited'
    | 'network_error'
    | 'server_error';
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
  quota?: {
    shortUsed: number;
    shortRemaining: number;
    longUsed: number;
    longRemaining: number;
    codeReviewUsed: number;
    codeReviewRemaining: number;
    shortResetAfter: number;
    longResetAfter: number;
  };
}

interface WhamUsageResponse {
  rate_limit?: {
    primary_window?: {
      used_percent?: number;
      reset_after_seconds?: number;
    };
    secondary_window?: {
      used_percent?: number;
      reset_after_seconds?: number;
    };
  };
  code_review_rate_limit?: {
    primary_window?: {
      used_percent?: number;
    };
  };
}

interface ValidateOptions {
  minTtlMs?: number;
  allowRefresh?: boolean;
}

export class TokenValidator {
  async validateOrRefresh(
    accountId: string,
    credentials: AccountCredentials,
    options: ValidateOptions = {}
  ): Promise<TokenValidationResult> {
    const { minTtlMs = 120000, allowRefresh = true } = options;
    void accountId;
    
    let token = credentials.accessToken;
    let refreshToken = credentials.refreshToken;
    let expiresAt = credentials.expiresAt;
    let status: TokenValidationResult['status'] = 'valid';

    // Check if token is about to expire
    const now = Date.now();
    const expiresSoon = expiresAt && (expiresAt.getTime() - now) < minTtlMs;

    if (expiresSoon && allowRefresh && refreshToken) {
      try {
        const newSession = await refreshAccessToken(refreshToken);
        if (newSession && newSession.accessToken) {
          token = newSession.accessToken;
          refreshToken = newSession.refreshToken || refreshToken;
          expiresAt = newSession.expiresAt;
          status = 'refreshed';
        }
      } catch (error) {
        return {
          status: 'unauthorized',
          error: `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // Validate token by calling API
    if (!token) {
      return {
        status: 'unauthorized',
        error: 'No access token available',
      };
    }

    try {
      const quota = await this.fetchQuota(token);
      
      if (quota) {
        return {
          status,
          accessToken: token,
          refreshToken,
          expiresAt,
          quota,
        };
      }
      
      return {
        status: 'server_error',
        error: 'Failed to fetch quota from API',
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      
      if (errMsg.includes('401') || errMsg.includes('unauthorized')) {
        return {
          status: 'unauthorized',
          error: errMsg,
        };
      }
      
      if (errMsg.includes('429') || errMsg.includes('rate limit')) {
        return {
          status: 'rate_limited',
          error: errMsg,
        };
      }
      
      if (errMsg.includes('network') || errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED')) {
        return {
          status: 'network_error',
          error: errMsg,
        };
      }
      
      return {
        status: 'server_error',
        error: errMsg,
      };
    }
  }

  private async fetchQuota(accessToken: string) {
    try {
      const url = new URL(WHAM_API_URL);
      url.searchParams.append('_t', Date.now().toString());

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Oai-Client-Build-Number': '5298191',
          'Oai-Client-Version': 'prod',
          'Oai-Device-Id': 'a2627114-a2f6-48f5-9460-a8885314d15d',
          'Oai-Language': 'zh-CN',
          'Referer': 'https://chatgpt.com/codex/settings/usage',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json() as WhamUsageResponse;
      
      return {
        shortUsed: data.rate_limit?.primary_window?.used_percent || 0,
        shortRemaining: 100 - (data.rate_limit?.primary_window?.used_percent || 0),
        longUsed: data.rate_limit?.secondary_window?.used_percent || 0,
        longRemaining: 100 - (data.rate_limit?.secondary_window?.used_percent || 0),
        codeReviewUsed: data.code_review_rate_limit?.primary_window?.used_percent || 0,
        codeReviewRemaining: 100 - (data.code_review_rate_limit?.primary_window?.used_percent || 0),
        shortResetAfter: data.rate_limit?.primary_window?.reset_after_seconds || 0,
        longResetAfter: data.rate_limit?.secondary_window?.reset_after_seconds || 0
      };
    } catch (error) {
      throw error;
    }
  }

  async fetchQuotaOnly(accessToken: string): Promise<TokenValidationResult['quota']> {
    return await this.fetchQuota(accessToken);
  }
}
