import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getPoolDir } from '../utils/paths.js';
import type { AppLanguage } from '../i18n/index.js';

export interface CliConfig {
  language?: AppLanguage;
}

const CONFIG_FILE = 'config.json';

export class ConfigStore {
  private configPath: string;
  private config: CliConfig;

  constructor() {
    this.configPath = join(getPoolDir(), CONFIG_FILE);
    this.config = this.load();
  }

  private load(): CliConfig {
    if (!existsSync(this.configPath)) {
      return this.getDefaultConfig();
    }

    try {
      const content = readFileSync(this.configPath, 'utf8');
      return { ...this.getDefaultConfig(), ...JSON.parse(content) };
    } catch {
      return this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): CliConfig {
    return {
      language: 'zh-CN',
    };
  }

  save(): void {
    const dir = getPoolDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), { mode: 0o600 });
  }

  getLanguage(): AppLanguage {
    return this.config.language || 'zh-CN';
  }

  setLanguage(language: AppLanguage): void {
    this.config.language = language;
    this.save();
  }

  getConfig(): CliConfig {
    return { ...this.config };
  }
}

export function resolveLanguage(argv: string[], env: NodeJS.ProcessEnv): AppLanguage {
  const store = new ConfigStore();
  
  const cliFlag = argv.find((arg, i) => 
    (arg === '--lang' || arg === '-L') && argv[i + 1]
  );
  const cliIndex = cliFlag ? argv.indexOf(cliFlag) : -1;
  if (cliIndex >= 0 && argv[cliIndex + 1]) {
    const lang = argv[cliIndex + 1] as AppLanguage;
    if (lang === 'zh-CN' || lang === 'en') {
      return lang;
    }
  }

  if (env.CODEX_POOL_LANGUAGE) {
    const lang = env.CODEX_POOL_LANGUAGE as AppLanguage;
    if (lang === 'zh-CN' || lang === 'en') {
      return lang;
    }
  }

  const configLang = store.getLanguage();
  if (configLang) {
    return configLang;
  }

  const systemLang = env.LANG || env.LC_ALL;
  if (systemLang?.startsWith('zh')) {
    return 'zh-CN';
  }

  return 'zh-CN';
}
