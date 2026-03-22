import { Command } from 'commander';
import { resolveLanguage } from './services/config-store.js';
import { setLanguage, t } from './i18n/index.js';
import { getVersion } from './utils/version.js';
import chalk from 'chalk';

async function main() {
  const language = resolveLanguage(process.argv, process.env);
  setLanguage(language);

  const { accountCommands } = await import('./commands/account.js');
  const { authCommands } = await import('./commands/auth.js');
  const { quotaCommands } = await import('./commands/quota.js');
  const { poolCommands } = await import('./commands/pool.js');
  const { debugCommands } = await import('./commands/debug.js');

  const program = new Command();

  program
    .name('codex-pool')
    .description(t('cli.description'))
    .version(getVersion(), '-V, --version', t('cli.options.version'))
    .option('-L, --lang <language>', t('cli.options.language'))
    .helpOption('-h, --help', t('cli.options.help'))
    .addHelpText('after', `
${t('cli.help.examplesTitle')}

  ${chalk.bold('快速开始:')}
  $ codex-pool auth login                           ${t('cli.help.exampleLogin')}
  $ codex-pool account list                         ${t('cli.help.exampleList')}
  $ codex-pool pool current                         ${t('cli.help.exampleCurrent')}

  ${chalk.bold('账号切换:')}
  $ codex-pool pool use <account-id>                切换到指定账号
  $ codex-pool pool use <account-id> --force        强制切换（跳过验证）
  $ codex-pool pool use <account-id> --dry-run      预览切换结果
  $ codex-pool pool rotate                          自动轮换到最佳账号
  $ codex-pool pool rotate -s weighted              使用加权策略轮换
  $ codex-pool pool rotate -s least-used            使用最少使用策略轮换
  $ codex-pool pool rotate --exclude id1 id2        排除指定账号后轮换
  $ codex-pool pool next                            切换到轮换顺序中的下一个
  $ codex-pool pool next --dry-run                  预览下一个账号

  ${chalk.bold('账号管理:')}
  $ codex-pool account list                         列出所有账号
  $ codex-pool account list -s active               只显示活跃账号
  $ codex-pool account show <account-id>            查看账号详情
  $ codex-pool account remove <account-id>          删除账号（需确认）
  $ codex-pool account remove <account-id> -f       强制删除账号
  $ codex-pool account disable <account-id>         禁用账号
  $ codex-pool account enable <account-id>          启用账号

  ${chalk.bold('认证管理:')}
  $ codex-pool auth login                           自动登录并创建账号
  $ codex-pool auth validate <account-id>           验证 Session 有效性
  $ codex-pool auth logout <account-id>             删除凭证并登出

  ${chalk.bold('额度管理:')}
  $ codex-pool quota check <account-id>             检查账号额度
  $ codex-pool quota monitor                        实时监控所有账号额度
  $ codex-pool quota monitor -i 60                  每60秒刷新一次

  ${chalk.bold('池管理:')}
  $ codex-pool pool status                          查看池状态概览
  $ codex-pool pool current                         查看当前使用的账号
  $ codex-pool pool lease list                      查看活跃租约
  $ codex-pool pool lease release <lease-id>        释放指定租约

${t('cli.help.commandsTitle')}
  account
    list                      ${t('cli.help.accountList')}
    show <id>                 ${t('cli.help.accountShow')}
    remove <id>               ${t('cli.help.accountRemove')}
    enable <id>               ${t('cli.help.accountEnable')}
    disable <id>              ${t('cli.help.accountDisable')}

  auth
    login                     ${t('cli.help.authLogin')}
    validate <id>             ${t('cli.help.authValidate')}
    logout <id>               ${t('cli.help.authLogout')}

  quota
    check <id>                ${t('cli.help.quotaCheck')}
    monitor                   ${t('cli.help.quotaMonitor')}

  pool
    status                    ${t('cli.help.poolStatus')}
    current                   ${t('cli.help.poolCurrent')}
    use <id>                  ${t('cli.help.poolUse')}
    rotate                    ${t('cli.help.poolRotate')}
    next                      ${t('cli.help.poolNext')}
    lease list                ${t('cli.help.poolLeaseList')}
    lease release <id>        ${t('cli.help.poolLeaseRelease')}
`);

  program
    .command('account')
    .description(t('commands.account.description'))
    .addCommand(accountCommands.list)
    .addCommand(accountCommands.show)
    .addCommand(accountCommands.remove)
    .addCommand(accountCommands.enable)
    .addCommand(accountCommands.disable);

  program
    .command('auth')
    .description(t('commands.auth.description'))
    .addCommand(authCommands.login)
    .addCommand(authCommands.validate)
    .addCommand(authCommands.logout);

  program
    .command('quota')
    .description(t('commands.quota.description'))
    .addCommand(quotaCommands.check)
    .addCommand(quotaCommands.monitor);

  program
    .command('pool')
    .description(t('commands.pool.description'))
    .addCommand(poolCommands.status)
    .addCommand(poolCommands.use)
    .addCommand(poolCommands.rotate)
    .addCommand(poolCommands.next)
    .addCommand(poolCommands.current)
    .addCommand(poolCommands.legacyRotate)
    .addCommand(poolCommands.lease);

  program
    .command('debug')
    .description(t('commands.debug.description'))
    .addCommand(debugCommands.jwt);

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
