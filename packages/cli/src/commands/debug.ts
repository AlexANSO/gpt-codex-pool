import { Command } from 'commander';
import { PoolManager } from '../utils/pool-manager.js';
import chalk from 'chalk';

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const debugCommands = {
  jwt: new Command('jwt')
    .description('Decode and display JWT token from an account')
    .argument('<accountId>', 'Account ID to inspect')
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
        console.log(chalk.red('No access token found for this account'));
        process.exit(1);
      }

      const payload = decodeJWT(credentials.accessToken);
      if (!payload) {
        console.log(chalk.red('Failed to decode JWT'));
        process.exit(1);
      }

      console.log(chalk.blue('\nJWT Payload:'));
      console.log('='.repeat(60));
      
      for (const [key, value] of Object.entries(payload)) {
        if (typeof value === 'object' && value !== null) {
          console.log(chalk.yellow(`${key}:`));
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(`${key}: ${chalk.green(String(value))}`);
        }
      }
      
      console.log('='.repeat(60));
      
      const email = payload.email || payload.preferred_username;
      if (email) {
        console.log(chalk.blue(`\nDetected Email: ${email}`));
      } else {
        console.log(chalk.yellow('\nNo standard email field found'));
        console.log(chalk.gray('Look for email in nested objects above'));
      }
    }),
};
