import { randomBytes } from 'node:crypto';

const URL_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';

export function randomUrlId(size = 24) {
  const bytes = randomBytes(size);
  let id = '';

  for (let index = 0; index < size; index += 1) {
    id += URL_ALPHABET[bytes[index] & 63];
  }

  return id;
}
