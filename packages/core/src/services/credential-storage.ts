import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountCredentials, EncryptedData, SecretRef } from '../types';
import { EncryptionService } from './encryption';

export class CredentialStorage {
  private encryption: EncryptionService;
  private storageDir: string;

  constructor(
    private config: {
      storageDir: string;
      masterKeyEnvVar: string;
    }
  ) {
    this.encryption = new EncryptionService({
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      masterKeyEnvVar: config.masterKeyEnvVar
    });
    this.storageDir = config.storageDir;
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.storageDir)) {
      await mkdir(this.storageDir, { recursive: true });
    }
  }

  async storeCredentials(credentials: AccountCredentials): Promise<SecretRef> {
    const data = JSON.stringify({
      storageState: credentials.storageState,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      sessionCookies: credentials.sessionCookies,
      expiresAt: credentials.expiresAt,
      createdAt: credentials.createdAt
    });

    const encrypted = await this.encryption.encrypt(data);
    const fingerprint = this.encryption.hash(data);
    const filename = `${credentials.accountId}.enc`;
    const filepath = join(this.storageDir, filename);

    await writeFile(filepath, JSON.stringify(encrypted, null, 2));

    return {
      id: credentials.accountId,
      backend: 'file',
      path: filepath,
      fingerprint
    };
  }

  async retrieveCredentials(accountId: string): Promise<AccountCredentials | null> {
    const filepath = join(this.storageDir, `${accountId}.enc`);

    if (!existsSync(filepath)) {
      return null;
    }

    try {
      const fileContent = await readFile(filepath, 'utf8');
      const encrypted: EncryptedData = JSON.parse(fileContent);

      const decrypted = await this.encryption.decrypt(encrypted);
      const data = JSON.parse(decrypted);

      return {
        accountId,
        storageState: data.storageState,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        sessionCookies: data.sessionCookies,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
      };
    } catch (error) {
      throw new Error(`Failed to retrieve credentials for ${accountId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteCredentials(accountId: string): Promise<boolean> {
    const filepath = join(this.storageDir, `${accountId}.enc`);
    
    if (!existsSync(filepath)) {
      return false;
    }

    const { unlink } = await import('node:fs/promises');
    await unlink(filepath);
    return true;
  }
}
