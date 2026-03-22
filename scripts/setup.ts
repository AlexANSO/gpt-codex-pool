#!/usr/bin/env node
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

const POOL_DIR = join(homedir(), '.codex-pool');

console.log('🚀 Codex Account Pool Setup\\n');

// Create directories
const dirs = [
  POOL_DIR,
  join(POOL_DIR, 'data'),
  join(POOL_DIR, 'credentials')
];

for (const dir of dirs) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`✓ Created: ${dir}`);
  }
}

// Generate master key if not exists
const envFile = join(POOL_DIR, '.env');
if (!existsSync(envFile)) {
  const masterKey = randomBytes(48).toString('base64');
  writeFileSync(envFile, `CODEX_POOL_MASTER_KEY="${masterKey}"\\n`);
  console.log(`✓ Generated master key`);
  console.log(`\\n⚠️  IMPORTANT: Store this master key securely!`);
  console.log(`   Location: ${envFile}`);
} else {
  console.log(`✓ Environment file already exists`);
}

// Create initial accounts file
const accountsFile = join(POOL_DIR, 'data', 'accounts.json');
if (!existsSync(accountsFile)) {
  writeFileSync(accountsFile, JSON.stringify({ accounts: [] }, null, 2));
  console.log(`✓ Created accounts database`);
}

console.log('\\n✅ Setup complete!');
console.log('\\nNext steps:');
console.log('  1. Source the environment: source ~/.codex-pool/.env');
console.log('  2. Login in browser to create an account: codex-pool auth login');
