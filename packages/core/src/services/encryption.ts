import crypto from 'node:crypto';
import type { EncryptedData, EncryptionConfig } from '../types';

export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32;
  private ivLength = 16;
  private authTagLength = 16;

  constructor(private config: EncryptionConfig) {}

  async encrypt(plaintext: string, password?: string): Promise<EncryptedData> {
    const key = await this.deriveKey(password);
    const iv = crypto.randomBytes(this.ivLength);
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    
    const authTag = (cipher as any).getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: this.algorithm
    };
  }

  async decrypt(encrypted: EncryptedData, password?: string): Promise<string> {
    const key = await this.deriveKey(password);
    
    const decipher = crypto.createDecipheriv(
      encrypted.algorithm || this.algorithm,
      key,
      Buffer.from(encrypted.iv, 'base64')
    );

    (decipher as any).setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  private async deriveKey(password?: string): Promise<Buffer> {
    const masterKey = password || process.env[this.config.masterKeyEnvVar];
    if (!masterKey) {
      throw new Error(`Encryption key not provided. Set ${this.config.masterKeyEnvVar} or provide password.`);
    }

    return new Promise((resolve, reject) => {
      crypto.pbkdf2(masterKey, 'codex-pool-salt', 100000, this.keyLength, 'sha256', (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
  }

  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }
}
