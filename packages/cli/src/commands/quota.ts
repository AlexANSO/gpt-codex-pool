import { Command } from 'commander';
import { PoolManager } from '../utils/pool-manager.js';
import { refreshAccessToken } from '@codex-pool/browser';
import chalk from 'chalk';

const WHAM_API_URL = 'https://chatgpt.com/backend-api/wham/usage';

const check = new Command('check')
  .description('Check account quota via API')
  .argument('<accountId>', 'Account ID')
  .action(async (accountId) => {
    const manager = new PoolManager();
    await manager.initialize();

    const account = manager.getAccount(accountId);
    if (!account) {
      console.log(chalk.red(`Account ${accountId} not found`));
      process.exit(1);
    }

    const credentials = await manager.getCredentials(accountId);
    
    if (!credentials?.accessToken) {
      console.log(chalk.yellow('No credentials found'));
      console.log(chalk.yellow('Run "codex-pool auth login" first'));
      process.exit(1);
    }

    console.log(chalk.blue(`\nAccount: ${account.email}`));
    console.log(chalk.blue('Fetching quota from API...\n'));
    
    let token = credentials.accessToken;
    let quota = await fetchQuotaFromAPI(token);
    
    if (!quota && credentials.refreshToken) {
      console.log(chalk.yellow('Token expired, refreshing...'));
      const newSession = await refreshAccessToken(credentials.refreshToken);
      if (newSession) {
        await manager.storeCredentials({
          accountId: account.id,
          storageState: newSession.storageState,
          accessToken: newSession.accessToken,
          refreshToken: newSession.refreshToken,
          sessionCookies: {},
          expiresAt: newSession.expiresAt,
          createdAt: new Date()
        });
        token = newSession.accessToken || token;
        quota = await fetchQuotaFromAPI(token);
      }
    }
    
    if (quota) {
      console.log(chalk.green('✓ Quota retrieved\n'));
      displayQuota(quota);
    } else {
      console.log(chalk.red('✗ Failed to fetch quota'));
      process.exit(1);
    }
  });

const monitor = new Command('monitor')
  .description('Monitor account quota in real-time')
  .option('-i, --interval <seconds>', 'Refresh interval', '30')
  .action(async (options) => {
    const manager = new PoolManager();
    await manager.initialize();

    const accounts = manager.getAllAccounts().filter(a => a.status === 'active');
    
    if (accounts.length === 0) {
      console.log(chalk.yellow('No active accounts'));
      return;
    }

    console.log(chalk.blue(`Monitoring ${accounts.length} accounts (Ctrl+C to stop)...\n`));

    const monitorOnce = async () => {
      const idColumnWidth = 24;
      const accountColumnWidth = 32;
      const header =
        `${'ID'.padEnd(idColumnWidth)} ${'Account'.padEnd(accountColumnWidth)} ` +
        `${'5h Used'.padEnd(10)} ${'5h Rem'.padEnd(10)} ${'Weekly Used'.padEnd(12)} ` +
        `${'Weekly Rem'.padEnd(12)} ${'Code Review'}`;

      console.clear();
      console.log(chalk.bold(`Quota Monitor - ${new Date().toLocaleString()}`));
      console.log('='.repeat(header.length));
      console.log(header);
      console.log('-'.repeat(header.length));

      for (const account of accounts) {
        const credentials = await manager.getCredentials(account.id);
        
        if (!credentials?.accessToken) {
          console.log(
            `${account.id.padEnd(idColumnWidth)} ` +
            `${account.label.substring(0, 30).padEnd(accountColumnWidth)} ` +
            `${chalk.gray('no token'.padEnd(10))}`
          );
          continue;
        }

        try {
          const quota = await fetchQuotaFromAPI(credentials.accessToken);
          if (quota) {
            const shortColor = quota.shortRemaining < 10 ? chalk.red : quota.shortRemaining < 30 ? chalk.yellow : chalk.green;
            const longColor = quota.longRemaining < 10 ? chalk.red : quota.longRemaining < 30 ? chalk.yellow : chalk.green;

            console.log(
              `${account.id.padEnd(idColumnWidth)} ` +
              `${account.label.substring(0, 30).padEnd(accountColumnWidth)} ` +
              `${shortColor(String(quota.shortUsed + '%').padEnd(10))} ` +
              `${shortColor(String(quota.shortRemaining + '%').padEnd(10))} ` +
              `${longColor(String(quota.longUsed + '%').padEnd(12))} ` +
              `${longColor(String(quota.longRemaining + '%').padEnd(12))} ` +
              `${quota.codeReviewRemaining}%`
            );
          } else {
            console.log(
              `${account.id.padEnd(idColumnWidth)} ` +
              `${account.label.substring(0, 30).padEnd(accountColumnWidth)} ` +
              `${chalk.red('API Error'.padEnd(10))}`
            );
          }
        } catch {
          console.log(
            `${account.id.padEnd(idColumnWidth)} ` +
            `${account.label.substring(0, 30).padEnd(accountColumnWidth)} ` +
            `${chalk.red('Error'.padEnd(10))}`
          );
        }
      }

      console.log('='.repeat(header.length));
      console.log(chalk.gray(`Next update in ${options.interval}s...`));
    };

    await monitorOnce();
    
    const interval = setInterval(monitorOnce, parseInt(options.interval) * 1000);
    
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log(chalk.blue('\n\nMonitoring stopped'));
      process.exit(0);
    });
  });

interface QuotaData {
  shortUsed: number;
  shortRemaining: number;
  longUsed: number;
  longRemaining: number;
  codeReviewUsed: number;
  codeReviewRemaining: number;
  shortResetAfter: number;
  longResetAfter: number;
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

async function fetchQuotaFromAPI(accessToken: string): Promise<QuotaData | null> {
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
      console.error('API Error:', response.status);
      return null;
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
    console.error('Fetch error:', error);
    return null;
  }
}

function displayQuota(quota: QuotaData) {
  console.log(chalk.blue('5-Hour Limit:'));
  console.log(`  Used:      ${quota.shortUsed}%`);
  console.log(`  Remaining: ${quota.shortRemaining}%`);
  console.log(`  Resets in: ${formatDuration(quota.shortResetAfter)}\n`);
  
  console.log(chalk.blue('Weekly Limit:'));
  console.log(`  Used:      ${quota.longUsed}%`);
  console.log(`  Remaining: ${quota.longRemaining}%`);
  console.log(`  Resets in: ${formatDuration(quota.longResetAfter)}\n`);
  
  console.log(chalk.blue('Code Review:'));
  console.log(`  Used:      ${quota.codeReviewUsed}%`);
  console.log(`  Remaining: ${quota.codeReviewRemaining}%\n`);
  
  const shortStatus = quota.shortRemaining < 10 ? chalk.red('CRITICAL') : 
                     quota.shortRemaining < 30 ? chalk.yellow('WARNING') : 
                     chalk.green('HEALTHY');
  const longStatus = quota.longRemaining < 10 ? chalk.red('CRITICAL') : 
                    quota.longRemaining < 30 ? chalk.yellow('WARNING') : 
                    chalk.green('HEALTHY');
  
  console.log(`Status: Short ${shortStatus}, Long ${longStatus}`);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export const quotaCommands = { check, monitor };
