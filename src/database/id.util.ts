import { randomBytes } from 'crypto';

/** Generate the 24-character hexadecimal IDs used by the existing HTTP API. */
export function createPublicId(): string {
  return randomBytes(12).toString('hex');
}
