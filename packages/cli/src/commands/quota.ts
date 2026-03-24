import { Command } from 'commander';
import { PoolManager } from '../utils/pool-manager.js';
import { formatDuration } from '../i18n/index.js';
import { TokenValidator } from '../services/token-validator.js';
import chalk from 'chalk';

const tokenValidator = new TokenValidator();

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

    const result = await lookupQuota(manager, account.id, credentials);

    if (result.quota) {
      console.log(chalk.green('✓ Quota retrieved\n'));
      displayQuota(result.quota);
    } else {
      console.log(chalk.red(`✗ ${result.label}`));
      if (result.details) {
        console.log(chalk.gray(result.details));
      }
      process.exit(1);
    }
  });

const monitor = new Command('monitor')
  .description('Monitor account quota in real-time')
  .argument('[accountId]', 'Account ID (optional)')
  .option('-i, --interval <seconds>', 'Refresh interval', '30')
  .action(async (accountId, options) => {
    const manager = new PoolManager();
    await manager.initialize();

    const intervalSeconds = Number.parseInt(options.interval, 10);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      console.log(chalk.red(`Invalid interval: ${options.interval}`));
      process.exit(1);
    }

    const getMonitoredAccounts = () => {
      if (accountId) {
        const account = manager.getAccount(accountId);
        return account ? [account] : [];
      }

      return manager.getAllAccounts().filter(a => a.status === 'active' || a.status === 'degraded');
    };

    if (accountId) {
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
    }

    const accounts = getMonitoredAccounts();
    
    if (accounts.length === 0) {
      console.log(chalk.yellow('No active accounts'));
      return;
    }

    console.log(chalk.blue(`Monitoring ${accounts.length} accounts (Ctrl+C to stop)...\n`));

    const monitorOnce = async () => {
      const idColumnWidth = 24;
      const accountColumnWidth = 32;
      const weeklyResetColumnWidth = 14;
      const header =
        `${'ID'.padEnd(idColumnWidth)} ${'Account'.padEnd(accountColumnWidth)} ` +
        `${'5h Used'.padEnd(10)} ${'5h Rem'.padEnd(10)} ${'Weekly Used'.padEnd(12)} ` +
        `${'Weekly Rem'.padEnd(12)} ${'Weekly Reset'.padEnd(weeklyResetColumnWidth)} ${'Code Review'}`;

      console.clear();
      console.log(chalk.bold(`Quota Monitor - ${new Date().toLocaleString()}`));
      console.log('='.repeat(header.length));
      console.log(header);
      console.log('-'.repeat(header.length));

      const accounts = getMonitoredAccounts();

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
          const result = await lookupQuota(manager, account.id, credentials);
          if (result.quota) {
            const shortColor = result.quota.shortRemaining < 10 ? chalk.red : result.quota.shortRemaining < 30 ? chalk.yellow : chalk.green;
            const longColor = result.quota.longRemaining < 10 ? chalk.red : result.quota.longRemaining < 30 ? chalk.yellow : chalk.green;

            console.log(
              `${account.id.padEnd(idColumnWidth)} ` +
              `${account.label.substring(0, 30).padEnd(accountColumnWidth)} ` +
              `${shortColor(String(result.quota.shortUsed + '%').padEnd(10))} ` +
              `${shortColor(String(result.quota.shortRemaining + '%').padEnd(10))} ` +
              `${longColor(String(result.quota.longUsed + '%').padEnd(12))} ` +
              `${longColor(String(result.quota.longRemaining + '%').padEnd(12))} ` +
              `${longColor(formatDuration(result.quota.longResetAfter).padEnd(weeklyResetColumnWidth))} ` +
              `${result.quota.codeReviewRemaining}%`
            );
          } else {
            console.log(
              `${account.id.padEnd(idColumnWidth)} ` +
              `${account.label.substring(0, 30).padEnd(accountColumnWidth)} ` +
              `${chalk.red(result.label.padEnd(10))}`
            );
          }
        } catch (error) {
          console.log(
            `${account.id.padEnd(idColumnWidth)} ` +
            `${account.label.substring(0, 30).padEnd(accountColumnWidth)} ` +
            `${chalk.red((error instanceof Error ? error.message : 'Error').slice(0, 10).padEnd(10))}`
          );
        }
      }

      console.log('='.repeat(header.length));
      console.log(chalk.gray(`Next update in ${intervalSeconds}s...`));
    };

    await monitorOnce();
    
    const interval = setInterval(monitorOnce, intervalSeconds * 1000);
    
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

interface QuotaLookupResult {
  quota?: QuotaData;
  label: string;
  details?: string;
}

async function lookupQuota(
  manager: PoolManager,
  accountId: string,
  credentials: NonNullable<Awaited<ReturnType<PoolManager['getCredentials']>>>
): Promise<QuotaLookupResult> {
  try {
    const validation = await tokenValidator.validateOrRefresh(accountId, credentials, {
      allowRefresh: true,
    });

    if (validation.status === 'refreshed' && validation.accessToken && validation.expiresAt) {
      await manager.storeCredentials({
        ...credentials,
        accountId,
        accessToken: validation.accessToken,
        refreshToken: validation.refreshToken || credentials.refreshToken,
        expiresAt: validation.expiresAt,
      });
    }

    if (validation.status === 'unauthorized') {
      manager.updateAccountStatus(accountId, 'reauth_required', validation.error || 'Token validation failed');
      return { label: 'Reauth', details: validation.error };
    }

    if (validation.status === 'rate_limited') {
      manager.setCooldown(accountId);
      return { label: 'Cooldown', details: validation.error };
    }

    if (validation.status === 'network_error') {
      return { label: 'Network', details: validation.error };
    }

    if (validation.status === 'server_error') {
      return { label: 'API Error', details: validation.error };
    }

    if (!validation.quota) {
      return { label: 'No quota', details: 'Quota data was not returned by validation.' };
    }

    const account = manager.getAccount(accountId);
    if (account && (account.status === 'cooldown' || account.status === 'reauth_required')) {
      manager.updateAccountStatus(accountId, 'active');
    }

    return {
      label: validation.status === 'refreshed' ? 'Refreshed' : 'OK',
      quota: validation.quota,
    };
  } catch (error) {
    return {
      label: 'Error',
      details: error instanceof Error ? error.message : String(error),
    };
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

export const quotaCommands = { check, monitor };
