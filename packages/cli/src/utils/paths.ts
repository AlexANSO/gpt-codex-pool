import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const POOL_DIR = join(process.env.HOME || process.env.USERPROFILE || '.', '.codex-pool');

export function getPoolDir(): string {
  if (!existsSync(POOL_DIR)) {
    mkdirSync(POOL_DIR, { recursive: true });
  }
  return POOL_DIR;
}

export function getDataDir(): string {
  const dataDir = join(getPoolDir(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

export function getCredentialsDir(): string {
  const credsDir = join(getPoolDir(), 'credentials');
  if (!existsSync(credsDir)) {
    mkdirSync(credsDir, { recursive: true });
  }
  return credsDir;
}
