import { Command } from 'commander';
import { PoolManager } from '../utils/pool-manager.js';
import { t } from '../i18n/index.js';
import chalk from 'chalk';

const list = new Command('list')
  .alias('ls')
  .description('List all accounts in the pool')
  .option('-s, --status <status>', 'Filter by status')
  .action(async (options) => {
    const manager = new PoolManager();
    await manager.initialize();

    const accounts = manager.getAllAccounts();
    
    if (accounts.length === 0) {
      console.log(chalk.yellow('No accounts found. Run "codex-pool auth login" to add one.'));
      return;
    }

    const filtered = options.status 
      ? accounts.filter(a => a.status === options.status)
      : accounts;

    console.log(chalk.bold('\\nAccounts:'));
    console.log('=' .repeat(92));
    console.log(
      chalk.gray(
        `${'ID'.padEnd(25)} ${'Email'.padEnd(30)} ${'Status'.padEnd(12)} ${'Tier'.padEnd(8)} ${'Health'.padEnd(8)} ${'Tags'}`
      )
    );
    console.log('-'.repeat(92));

    for (const account of filtered) {
      const statusColor = {
        active: chalk.green,
        draft: chalk.gray,
        cooldown: chalk.yellow,
        degraded: chalk.hex('#FFA500'),
        reauth_required: chalk.red,
        disabled: chalk.gray
      }[account.status] || chalk.white;

      console.log(
        `${account.id.padEnd(25)} ` +
        `${account.email.substring(0, 28).padEnd(30)} ` +
        `${statusColor(account.status.padEnd(12))} ` +
        `${account.planTier.padEnd(8)} ` +
        `${account.healthScore.toString().padEnd(8)} ` +
        `${account.tags.join(', ') || '-'}`
      );
    }

    console.log('='.repeat(92));
    console.log(chalk.gray(`Total: ${filtered.length} accounts`));
  });

const show = new Command('show')
  .description('Show detailed account information')
  .argument('<id>', 'Account ID')
  .action(async (id) => {
    const manager = new PoolManager();
    await manager.initialize();

    const account = manager.getAccount(id);
    if (!account) {
      console.log(chalk.red(`Account ${id} not found`));
      process.exit(1);
    }

    console.log(chalk.bold('\\nAccount Details:'));
    console.log('='.repeat(50));
    console.log(`ID:        ${account.id}`);
    console.log(`Label:     ${account.label}`);
    console.log(`Email:     ${account.email}`);
    console.log(`Provider:  ${account.provider}`);
    console.log(`Tier:      ${account.planTier}`);
    console.log(`Status:    ${account.status}`);
    console.log(`Priority:  ${account.priorityWeight}`);
    console.log(`Health:    ${account.healthScore}%`);
    console.log(`Tags:      ${account.tags.join(', ') || 'None'}`);
    console.log(`Created:   ${account.createdAt.toISOString()}`);
    console.log(`Updated:   ${account.updatedAt.toISOString()}`);
    
    if (account.lastLoginAt) {
      console.log(`Last Login: ${account.lastLoginAt.toISOString()}`);
    }
    if (account.cooldownUntil) {
      console.log(`Cooldown Until: ${account.cooldownUntil.toISOString()}`);
    }
    if (account.notes) {
      console.log(`Notes:     ${account.notes}`);
    }
  });

const remove = new Command('remove')
  .alias('rm')
  .description('Remove an account from the pool')
  .argument('<id>', 'Account ID to remove')
  .option('-f, --force', 'Force removal without confirmation')
  .action(async (id, options) => {
    const manager = new PoolManager();
    await manager.initialize();

    const account = manager.getAccount(id);
    if (!account) {
      console.log(chalk.red(`Account ${id} not found`));
      process.exit(1);
    }

    if (!options.force) {
      console.log(chalk.yellow(`\\nThis will remove account: ${account.email}`));
      console.log(chalk.red('This action cannot be undone!'));
      
      const readline = await import('node:readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('Type "yes" to confirm: ', resolve);
      });
      
      rl.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log(chalk.gray('Cancelled'));
        process.exit(0);
      }
    }

    await manager.removeAccount(id);
    console.log(chalk.green('✓ Account removed successfully'));
  });

const enable = new Command('enable')
  .description('Enable a disabled account')
  .argument('<id>', 'Account ID to enable')
  .action(async (id) => {
    const manager = new PoolManager();
    await manager.initialize();

    const account = manager.getAccount(id);
    if (!account) {
      console.log(chalk.red(`Account ${id} not found`));
      process.exit(1);
    }

    manager.updateAccountStatus(id, 'active');
    console.log(chalk.green(`✓ Account ${id} enabled`));
  });

const disable = new Command('disable')
  .description('Disable an account')
  .argument('<id>', 'Account ID to disable')
  .action(async (id) => {
    const manager = new PoolManager();
    await manager.initialize();

    const account = manager.getAccount(id);
    if (!account) {
      console.log(chalk.red(`Account ${id} not found`));
      process.exit(1);
    }

    manager.updateAccountStatus(id, 'disabled');
    console.log(chalk.yellow(`✓ Account ${id} disabled`));
  });

export const accountCommands = { list, show, remove, enable, disable };
