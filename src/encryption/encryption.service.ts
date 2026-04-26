import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('APP_ENCRYPTION_KEY') ?? '';
    if (!raw) throw new Error('Missing APP_ENCRYPTION_KEY');
    this.key = createHash('sha256').update(raw).digest();
  }

  encryptString(plaintext: string): string {
    if (!plaintext) return plaintext;
    if (plaintext.startsWith('enc:')) return plaintext;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, tag, ciphertext]).toString('base64');
    return `enc:${payload}`;
  }

  decryptString(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith('enc:')) return value;

    const payload = value.slice(4);
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return plaintext;
  }
}

