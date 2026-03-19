import { Command } from 'commander';
import { AuthManager } from '@codex-pool/browser';
import { PoolManager } from '../utils/pool-manager.js';
import { nanoid } from 'nanoid';
import chalk from 'chalk';
import ora from 'ora';

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

function extractEmailFromJWT(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;

  const possibleFields = [
    'email',
    'preferred_username',
  ];

  for (const field of possibleFields) {
    const value = payload[field];
    if (typeof value === 'string' && value.includes('@')) {
      return value;
    }
  }

  const profile = payload['https://api.openai.com/profile'] as Record<string, unknown> | undefined;
  if (profile && typeof profile.email === 'string' && profile.email.includes('@')) {
    return profile.email;
  }

  const name = payload.name as string;
  if (typeof name === 'string' && name.includes('@')) {
    return name;
  }

  return null;
}

const loginManual = new Command('login-manual')
  .description('Authenticate a specific account using OAuth (manual mode)')
  .argument('<accountId>', 'Account ID to authenticate')
  .action(async (accountId) => {
    const manager = new PoolManager();
    await manager.initialize();

    const account = manager.getAccount(accountId);
    if (!account) {
      console.log(chalk.red(`Account ${accountId} not found`));
      console.log(chalk.gray('Run "codex-pool account list" to see available accounts'));
      process.exit(1);
    }

    console.log(chalk.blue(`\\nAuthenticating account: ${account.email}\\n`));

    const authManager = new AuthManager();

    try {
      const result = await authManager.startInteractiveLogin();

      if (!result.success || !result.session) {
        console.log(chalk.red(`\\n✗ Login failed: ${result.error}`));
        process.exit(1);
      }

      const spinner = ora('Storing credentials...').start();
      
      await manager.storeCredentials({
        accountId: account.id,
        storageState: result.session.storageState,
        accessToken: result.session.accessToken,
        sessionCookies: result.session.cookies,
        expiresAt: result.session.expiresAt,
        createdAt: new Date()
      });

      spinner.succeed('Credentials stored securely');
      console.log(chalk.green('\\n✓ Login successful!'));
      console.log(chalk.gray(`Session expires: ${result.session.expiresAt?.toISOString() || 'Unknown'}`));

    } catch (error) {
      console.log(chalk.red('Login failed'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    } finally {
      await authManager.close();
    }
  });

const validate = new Command('validate')
  .description('Validate stored session for an account')
  .argument('<accountId>', 'Account ID to validate')
  .action(async (accountId) => {
    const manager = new PoolManager();
    await manager.initialize();

    const account = manager.getAccount(accountId);
    if (!account) {
      console.log(chalk.red(`Account ${accountId} not found`));
      process.exit(1);
    }

    const credentials = await manager.getCredentials(accountId);
    
    if (!credentials) {
      console.log(chalk.yellow('No stored credentials found'));
      console.log(chalk.yellow('Run "codex-pool auth login" to authenticate this account'));
      process.exit(1);
    }

    console.log(chalk.green('✓ Credentials exist'));
    console.log(chalk.gray(`Stored at: ${credentials.createdAt.toISOString()}`));
    console.log(chalk.gray(`Expires at: ${credentials.expiresAt?.toISOString() || 'Unknown'}`));
  });

const logout = new Command('logout')
  .description('Remove stored credentials for an account')
  .argument('<accountId>', 'Account ID')
  .action(async (accountId) => {
    const manager = new PoolManager();
    await manager.initialize();

    const account = manager.getAccount(accountId);
    if (!account) {
      console.log(chalk.red(`Account ${accountId} not found`));
      process.exit(1);
    }

    const { CredentialStorage } = await import('@codex-pool/core');
    const { getCredentialsDir } = await import('../utils/paths.js');
    
    const storage = new CredentialStorage({
      storageDir: getCredentialsDir(),
      masterKeyEnvVar: 'CODEX_POOL_MASTER_KEY'
    });
    
    await storage.initialize();
    await storage.deleteCredentials(accountId);
    
    manager.updateAccountStatus(accountId, 'draft', 'Logged out');
    
    console.log(chalk.green('✓ Credentials removed'));
    console.log(chalk.gray(`Account ${accountId} status: draft`));
  });

const login = new Command('login')
  .description('Auto login - creates account and stores credentials in one step')
  .action(async () => {
    const manager = new PoolManager();
    await manager.initialize();

    console.log(chalk.blue('\n=== Automatic ChatGPT Login ===\n'));
    console.log(chalk.gray('This will:'));
    console.log(chalk.gray('  1. Open browser for OAuth login'));
    console.log(chalk.gray('  2. Auto-create account with your email'));
    console.log(chalk.gray('  3. Store credentials securely\n'));

    const authManager = new AuthManager();

    try {
      const result = await authManager.startInteractiveLogin();

      if (!result.success || !result.session) {
        console.log(chalk.red(`\n✗ Login failed: ${result.error}`));
        process.exit(1);
      }

      const spinner = ora('Processing...').start();

      const accessToken = result.session.accessToken;
      if (!accessToken) {
        spinner.fail('No access token received');
        process.exit(1);
      }

      const jwtPayload = decodeJWT(accessToken);
      
      const email = extractEmailFromJWT(jwtPayload);

      if (!email) {
        spinner.fail('Could not extract email from token');
        console.log(chalk.gray('JWT claims available:'), Object.keys(jwtPayload || {}).join(', '));
        process.exit(1);
      }

      spinner.text = 'Creating account...';

      const existingAccounts = manager.getAllAccounts().filter(a => a.email === email);
      if (existingAccounts.length > 0) {
        spinner.info(`Account with email ${email} already exists`);
        console.log(chalk.yellow(`\nExisting account ID: ${existingAccounts[0].id}`));
        console.log(chalk.gray('Updating credentials...'));
      }

      const accountId = existingAccounts[0]?.id || nanoid();

      if (existingAccounts.length === 0) {
        manager.addAccount({
          id: accountId,
          label: email,
          email: email,
          provider: 'chatgpt' as const,
          planTier: 'plus',
          status: 'active' as const,
          priorityWeight: 5,
          healthScore: 100,
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      spinner.text = 'Storing credentials...';

      await manager.storeCredentials({
        accountId: accountId,
        storageState: result.session.storageState,
        accessToken: result.session.accessToken,
        refreshToken: result.session.refreshToken,
        sessionCookies: result.session.cookies,
        expiresAt: result.session.expiresAt,
        createdAt: new Date()
      });

      spinner.succeed('Login completed!');

      console.log(chalk.green('\n✓ Account created and authenticated!'));
      console.log(chalk.blue(`\nAccount ID: ${accountId}`));
      console.log(chalk.gray(`Email: ${email}`));
      console.log(chalk.gray(`Status: active`));
      console.log(chalk.gray(`Session expires: ${result.session.expiresAt?.toISOString() || 'Unknown'}`));
      console.log(chalk.gray('\nYou can now use:'));
      console.log(chalk.gray(`  codex-pool pool use ${accountId}  # Switch to this account`));
      console.log(chalk.gray(`  codex-pool quota check ${accountId}  # Check quota`));

    } catch (error) {
      console.log(chalk.red('\n✗ Login failed'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    } finally {
      await authManager.close();
    }
  });

export const authCommands = { login, loginManual, validate, logout };
