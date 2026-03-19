/**
 * Codex Provider Types
 */

export interface CodexSession {
  sessionToken: string;
  auth0Token?: string;
  accessToken: string;
  organizationId?: string;
  expiresAt: Date;
}

export interface CodexQuota {
  // Short-term window (typically 5 hours)
  shortWindow: {
    used: number;
    remaining: number;
    resetAt: Date;
  };
  // Long-term window (typically 7 days)
  longWindow: {
    used: number;
    remaining: number;
    resetAt: Date;
  };
  // Additional metadata
  tier: 'plus' | 'pro';
  modelLimits?: Record<string, {
    used: number;
    remaining: number;
  }>;
}

export interface CodexApiResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  headers?: Record<string, string>; // Rate limit headers
}

export type CodexModel = 
  | 'gpt-5.2'
  | 'gpt-5.2-codex'
  | 'gpt-5.1-codex'
  | 'gpt-5.1-codex-max'
  | 'gpt-5.1-codex-mini'
  | 'gpt-5.1';

export interface CodexRequestOptions {
  model: CodexModel;
  variant?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  stream?: boolean;
}
