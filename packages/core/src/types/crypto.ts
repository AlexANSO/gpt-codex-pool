/**
 * Encryption and Security Types
 */

export interface EncryptedData {
  ciphertext: string;      // Base64 encoded encrypted data
  iv: string;             // Base64 encoded initialization vector
  authTag: string;        // Base64 encoded authentication tag (GCM)
  algorithm: string;      // Encryption algorithm used
}

export interface SecretRef {
  id: string;
  backend: 'file' | 'keychain' | 'vault' | 'memory';
  path: string;
  version?: string;
  fingerprint: string;    // Hash of the secret for verification
}

export interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  keyDerivation: 'pbkdf2' | 'argon2';
  masterKeyEnvVar: string;
}

export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyDerivation: 'pbkdf2',
  masterKeyEnvVar: 'CODEX_POOL_MASTER_KEY'
};
