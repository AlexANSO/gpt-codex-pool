import { Command } from 'commander';
import { PoolManager } from '../utils/pool-manager.js';
import { OpenCodeSwitcher } from '../services/opencode-switcher.js';
import type { RotationStrategy } from '../services/rotation-state-store.js';
import { t, formatDateTime, formatDuration } from '../i18n/index.js';
import chalk from 'chalk';

const status = new Command('status')
  .description('Show pool status overview')
  .action(async () => {
    const manager = new PoolManager();
    await manager.initialize();

    const stats = manager.getStats();
    const accounts = manager.getAllAccounts();

    console.log(chalk.bold('\n' + t('commands.pool.status.header')));
    console.log('='.repeat(50));
    console.log(`${t('commands.pool.status.totalAccounts')}:    ${stats.totalAccounts}`);
    console.log(`${t('commands.pool.status.activeAccounts')}:   ${chalk.green(stats.activeAccounts.toString())}`);
    console.log(`${t('commands.pool.status.healthyAccounts')}:  ${stats.healthyAccounts > 0 ? chalk.green(stats.healthyAccounts.toString()) : chalk.gray('0')}`);
    console.log(`${t('commands.pool.status.activeLeases')}:     ${stats.activeLeases}`);
    console.log('='.repeat(50));

    if (accounts.length > 0) {
      console.log(chalk.bold('\n' + t('commands.pool.status.breakdown')));
      const statusCounts = accounts.reduce((acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [status, count] of Object.entries(statusCounts)) {
        const color = {
          active: chalk.green,
          draft: chalk.gray,
          cooldown: chalk.yellow,
          degraded: chalk.hex('#FFA500'),
          reauth_required: chalk.red,
          disabled: chalk.gray
        }[status] || chalk.white;

        console.log(`  ${t('labels.status.' + status).padEnd(18)}: ${color(count.toString())}`);
      }
    }

    const healthy = manager.getPool().getHealthyAccounts();
    if (healthy.length > 0) {
      console.log(chalk.bold('\n' + t('commands.pool.status.available')));
      for (const account of healthy.slice(0, 5)) {
        console.log(`  • ${account.email} (${t('labels.health')}: ${account.healthScore}%, ${t('labels.priority')}: ${account.priorityWeight})`);
      }
      if (healthy.length > 5) {
        console.log(chalk.gray(`  ... ${t('commands.pool.status.more', { count: healthy.length - 5 })}`));
      }
    } else if (accounts.length > 0) {
      console.log(chalk.yellow('\n' + t('commands.pool.status.noHealthy')));
    }
  });

const use = new Command('use')
  .description('Use a specific account for OpenCode (switch to this account)')
  .argument('<accountId>', 'Account ID to use')
  .option('--no-validate', 'Skip token validation')
  .option('--no-refresh', 'Do not refresh token even if expired')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--force', 'Force switch even if validation fails')
  .action(async (accountId, options) => {
    const switcher = new OpenCodeSwitcher();
    await switcher.initialize();

    try {
      const result = await switcher.useAccount(accountId, {
        validate: options.validate,
        allowRefresh: options.refresh,
        dryRun: options.dryRun,
        force: options.force,
      });

      if (options.dryRun) {
        console.log(chalk.blue(t('commands.pool.use.dryRun')));
      } else {
        console.log(chalk.green(t('commands.pool.use.success')));
      }

      console.log(`  ${t('commands.pool.use.accountId')}:    ${result.accountId}`);
      console.log(`  ${t('commands.pool.use.email')}:         ${result.accountEmail}`);
      console.log(`  ${t('commands.pool.use.tokenStatus')}:  ${result.refreshed ? t('commands.pool.use.tokenStatus.refreshed') : t('commands.pool.use.tokenStatus.valid')}`);
      console.log(`  ${t('commands.pool.use.expiresAt')}:    ${result.expiresAt?.toLocaleString() ?? 'Unknown'}`);
      
      if (result.quota) {
        console.log(chalk.blue('\n' + t('commands.pool.use.quotaTitle')));
        console.log(`  ${t('commands.pool.use.quota5h')}:       ${result.quota.shortRemaining}%`);
        console.log(`  ${t('commands.pool.use.quotaWeekly')}:   ${result.quota.longRemaining}%`);
        console.log(`  ${t('commands.pool.use.quotaCodeReview')}:    ${result.quota.codeReviewRemaining}%`);
      }

      if (!options.dryRun) {
        console.log(`\n${t('commands.pool.use.configPath')}: ${result.authPath}`);
        if (result.backupPath) {
          console.log(chalk.gray(`${t('commands.pool.use.backupSaved')}: ${result.backupPath}`));
        }
      }
    } catch (error) {
      console.log(chalk.red(`✗ ${t('commands.pool.use.failed')}: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

const rotate = new Command('rotate')
  .description('Rotate to the best available account using a strategy')
  .option('-s, --strategy <strategy>', 'Rotation strategy (round-robin|weighted|least-used)', 'round-robin')
  .option('--exclude <ids...>', 'Account IDs to exclude')
  .option('--dry-run', 'Show what would be selected without switching')
  .action(async (options) => {
    const switcher = new OpenCodeSwitcher();
    await switcher.initialize();

    const strategy = options.strategy as RotationStrategy;
    const validStrategies: RotationStrategy[] = ['round-robin', 'weighted', 'least-used'];
    
    if (!validStrategies.includes(strategy)) {
      console.log(chalk.red(`Invalid strategy: ${strategy}`));
      console.log(chalk.gray(`Valid strategies: ${validStrategies.join(', ')}`));
      process.exit(1);
    }

    try {
      const result = await switcher.rotate({
        strategy,
        excludeAccountIds: options.exclude || [],
        dryRun: options.dryRun,
      });

      if (options.dryRun) {
        console.log(chalk.blue('[DRY RUN] Would rotate to account:'));
      } else {
        console.log(chalk.green(`✓ Rotated using ${strategy} strategy:`));
      }

      console.log(`  Account ID:    ${result.accountId}`);
      console.log(`  Email:         ${result.accountEmail}`);
      console.log(`  Token Status:  ${result.refreshed ? 'Refreshed' : 'Valid'}`);
      console.log(`  Expires At:    ${result.expiresAt?.toLocaleString() ?? 'Unknown'}`);
      
      if (result.quota) {
        console.log(chalk.blue('\nQuota:'));
        console.log(`  5h Remaining:       ${result.quota.shortRemaining}%`);
        console.log(`  Weekly Remaining:   ${result.quota.longRemaining}%`);
        console.log(`  Code Review Rem:    ${result.quota.codeReviewRemaining}%`);
      }

      if (!options.dryRun) {
        console.log(`\nOpenCode config: ${result.authPath}`);
        if (result.backupPath) {
          console.log(chalk.gray(`Backup saved: ${result.backupPath}`));
        }
      }
    } catch (error) {
      console.log(chalk.red(`✗ Rotation failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

const next = new Command('next')
  .description('Switch to the next account in rotation order')
  .option('--dry-run', 'Show what would be selected without switching')
  .action(async (options) => {
    const switcher = new OpenCodeSwitcher();
    await switcher.initialize();

    try {
      const result = await switcher.next({
        dryRun: options.dryRun,
      });

      if (options.dryRun) {
        console.log(chalk.blue('[DRY RUN] Would switch to next account:'));
      } else {
        console.log(chalk.green('✓ Switched to next account:'));
      }

      console.log(`  Account ID:    ${result.accountId}`);
      console.log(`  Email:         ${result.accountEmail}`);
      console.log(`  Token Status:  ${result.refreshed ? 'Refreshed' : 'Valid'}`);
      console.log(`  Expires At:    ${result.expiresAt?.toLocaleString() ?? 'Unknown'}`);
      
      if (result.quota) {
        console.log(chalk.blue('\nQuota:'));
        console.log(`  5h Remaining:       ${result.quota.shortRemaining}%`);
        console.log(`  Weekly Remaining:   ${result.quota.longRemaining}%`);
        console.log(`  Code Review Rem:    ${result.quota.codeReviewRemaining}%`);
      }

      if (!options.dryRun) {
        console.log(`\nOpenCode config: ${result.authPath}`);
        if (result.backupPath) {
          console.log(chalk.gray(`Backup saved: ${result.backupPath}`));
        }
      }
    } catch (error) {
      console.log(chalk.red(`✗ ${t('commands.pool.rotate.failed')}: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

const current = new Command('current')
  .description(t('commands.pool.current.description'))
  .action(async () => {
    const switcher = new OpenCodeSwitcher();
    await switcher.initialize();

    try {
      const result = await switcher.getCurrentAccount();

      if (!result) {
        console.log(chalk.yellow(t('commands.pool.current.notFound')));
        console.log(chalk.gray(t('commands.pool.current.notFound.hint')));
        process.exit(1);
      }

      const { account, realEmail, authInfo, stateInfo } = result;

      console.log(chalk.bold('\n' + t('commands.pool.current.header')));
      console.log('='.repeat(60));

      if (account) {
        console.log(`${chalk.gray(t('labels.id') + ':')}           ${account.id}`);
        console.log(`${chalk.gray(t('labels.label') + ':')}        ${account.label}`);
        if (realEmail) {
          console.log(`${chalk.gray(t('labels.email') + ':')}        ${realEmail}`);
        } else {
          console.log(`${chalk.gray(t('labels.email') + ':')}        ${account.email}`);
        }
        console.log(`${chalk.gray(t('labels.tier') + ':')}         ${account.planTier}`);
        console.log(`${chalk.gray(t('labels.status') + ':')}       ${t('labels.status.' + account.status)}`);
        console.log(`${chalk.gray(t('labels.health') + ':')}       ${account.healthScore}%`);
      } else {
        console.log(chalk.yellow(t('commands.pool.current.notInPool')));
        console.log(chalk.gray('  ' + t('commands.pool.current.notInPool.hint')));
        if (realEmail) {
          console.log(`${chalk.gray(t('labels.email') + ':')}        ${realEmail}`);
        }
      }

      if (authInfo.expiresAt) {
        const expiresIn = authInfo.expiresAt.getTime() - Date.now();
        const expiresInHours = Math.floor(expiresIn / (1000 * 60 * 60));
        const isExpired = expiresIn < 0;
        
        console.log(`\n${chalk.gray('Token Expires:')} ${formatDateTime(authInfo.expiresAt)}`);
        if (isExpired) {
          console.log(chalk.red('  ' + t('commands.pool.current.tokenExpired')));
        } else if (expiresInHours < 24) {
          console.log(chalk.yellow('  ' + t('commands.pool.current.tokenExpiringSoon', { hours: expiresInHours })));
        } else {
          console.log(chalk.green('  ' + t('commands.pool.current.tokenValid', { hours: expiresInHours })));
        }
      }

      if (authInfo.quota) {
        console.log(`\n${chalk.blue(t('labels.quota') + ':')}`);
        const shortColor = authInfo.quota.shortRemaining < 10 ? chalk.red : authInfo.quota.shortRemaining < 30 ? chalk.yellow : chalk.green;
        const longColor = authInfo.quota.longRemaining < 10 ? chalk.red : authInfo.quota.longRemaining < 30 ? chalk.yellow : chalk.green;
        
        console.log(`  ${t('commands.pool.current.quota.5h')}: ${shortColor(authInfo.quota.shortRemaining + '%')}`);
        console.log(`  ${t('commands.pool.current.quota.weekly')}: ${longColor(authInfo.quota.longRemaining + '%')}`);
        console.log(`  ${t('commands.pool.current.quota.codeReview')}: ${authInfo.quota.codeReviewRemaining}%`);
      } else {
        console.log(`\n${chalk.gray(t('commands.pool.current.quota.unavailable'))}`);
      }

      if (stateInfo.lastSwitchedAt) {
        const secondsAgo = Math.floor((Date.now() - stateInfo.lastSwitchedAt.getTime()) / 1000);
        console.log(`\n${chalk.gray(t('labels.lastSwitched') + ':')} ${formatDateTime(stateInfo.lastSwitchedAt)}`);
        console.log(chalk.gray(`  (${formatDuration(secondsAgo)} ago)`));
      }

      if (stateInfo.totalSelections) {
        console.log(`${chalk.gray(t('labels.timesUsed') + ':')}    ${stateInfo.totalSelections}`);
      }

      console.log('='.repeat(60));
    } catch (error) {
      console.log(chalk.red(t('messages.operation.failed', { error: error instanceof Error ? error.message : String(error) })));
      process.exit(1);
    }
  });

const legacyRotate = new Command('legacy-rotate')
  .description('Select an account using rotation strategy (legacy, no OpenCode integration)')
  .option('-p, --purpose <purpose>', 'Purpose for this request')
  .option('--consumer <consumer>', 'Consumer ID', 'cli')
  .action(async (options) => {
    const manager = new PoolManager();
    await manager.initialize();

    const pool = manager.getPool();
    const account = pool.selectAccountForRequest();

    if (!account) {
      console.log(chalk.red('No available accounts'));
      console.log(chalk.gray('All accounts are either:'));
      console.log(chalk.gray('  - In cooldown period'));
      console.log(chalk.gray('  - Disabled/reauth required'));
      console.log(chalk.gray('  - At max lease capacity'));
      process.exit(1);
    }

    const lease = manager.acquireLease(account.id, options.consumer, options.purpose || 'cli-request');
    
    if (!lease) {
      console.log(chalk.red('Failed to acquire lease'));
      process.exit(1);
    }

    console.log(chalk.green('✓ Account selected'));
    console.log(`  ID:       ${account.id}`);
    console.log(`  Label:    ${account.label}`);
    console.log(`  Email:    ${account.email}`);
    console.log(`  Health:   ${account.healthScore}%`);
    console.log(`  Lease ID: ${lease.id}`);
    
    console.log(chalk.gray('\nUse this account for your request.'));
    console.log(chalk.gray(`Release lease with: codex-pool pool lease release ${lease.id}`));
  });

const lease = new Command('lease')
  .description('Lease management');

const leaseList = new Command('list')
  .description('List active leases')
  .action(async () => {
    const manager = new PoolManager();
    await manager.initialize();

    const accounts = manager.getAllAccounts();
    const allLeases = manager.getAllLeases().filter(lease => lease.status === 'active');

    console.log(chalk.bold('\nActive Leases'));
    console.log('='.repeat(100));
    
    if (allLeases.length === 0) {
      console.log(chalk.gray('No active leases'));
    } else {
      console.log(
        `${'Lease ID'.padEnd(25)} ${'Account'.padEnd(20)} ${'Consumer'.padEnd(15)} ${'Purpose'.padEnd(20)} ${'Started'}`
      );
      console.log('-'.repeat(100));
      
      for (const lease of allLeases) {
        const account = accounts.find(a => a.id === lease.accountId);
        console.log(
          `${lease.id.padEnd(25)} ` +
          `${(account?.label || lease.accountId).substring(0, 18).padEnd(20)} ` +
          `${lease.consumerId.padEnd(15)} ` +
          `${lease.purpose.substring(0, 18).padEnd(20)} ` +
          `${lease.startedAt.toLocaleTimeString()}`
        );
      }
    }
  });

const leaseRelease = new Command('release')
  .description('Release a lease')
  .argument('<leaseId>', 'Lease ID to release')
  .action(async (leaseId) => {
    const manager = new PoolManager();
    await manager.initialize();

    const released = manager.releaseLease(leaseId);

    if (released) {
      console.log(chalk.green(`✓ Lease ${leaseId} released`));
    } else {
      console.log(chalk.red(`Lease ${leaseId} not found or already released`));
      process.exit(1);
    }
  });

lease.addCommand(leaseList);
lease.addCommand(leaseRelease);

export const poolCommands = { status, use, rotate, next, current, legacyRotate, lease };
