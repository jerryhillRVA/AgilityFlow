import { hkdf, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;    // GCM standard nonce size
const KEY_LENGTH = 32;   // 256-bit key

export interface EncryptedPayload {
  /** Base64-encoded IV */
  iv: string;
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded GCM auth tag */
  tag: string;
}

/**
 * Derives a per-project Data Encryption Key from the ROOT_SECRET env var.
 * Uses HKDF with SHA-256. The tenant name is used as salt so each project
 * gets a distinct DEK even with the same ROOT_SECRET.
 */
async function deriveDEK(tenant: string): Promise<Buffer> {
  const rootSecret = process.env.ROOT_SECRET;
  if (!rootSecret) {
    throw new Error('ROOT_SECRET environment variable is not set. Cannot encrypt secrets.');
  }
  return new Promise((resolve, reject) => {
    hkdf('sha256', rootSecret, tenant, 'agility-dek', KEY_LENGTH, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

/**
 * Encrypts a plaintext string with AES-256-GCM using a project-scoped DEK.
 */
export async function encrypt(plaintext: string, tenant: string): Promise<EncryptedPayload> {
  const dek = await deriveDEK(tenant);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypts an EncryptedPayload back to plaintext.
 */
export async function decrypt(payload: EncryptedPayload, tenant: string): Promise<string> {
  const dek = await deriveDEK(tenant);
  const iv = Buffer.from(payload.iv, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Checks whether ROOT_SECRET is available for encryption.
 */
export function isEncryptionAvailable(): boolean {
  return !!process.env.ROOT_SECRET;
}
