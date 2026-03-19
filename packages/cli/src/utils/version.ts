import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function getVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf8')
    );
    return packageJson.version;
  } catch {
    return '1.0.0';
  }
}
