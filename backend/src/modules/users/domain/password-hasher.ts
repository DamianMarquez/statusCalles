import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, scryptOptions, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, keyLength);
  return `scrypt$32768$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltHex, hashHex] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    cost !== '32768' ||
    blockSize !== '8' ||
    parallelization !== '1' ||
    !saltHex ||
    !hashHex ||
    !/^[a-f0-9]{32}$/.test(saltHex) ||
    !/^[a-f0-9]{128}$/.test(hashHex)
  ) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await deriveKey(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}
