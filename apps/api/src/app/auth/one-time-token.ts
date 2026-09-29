import { createHash, randomBytes } from 'node:crypto';

/**
 * A token for a link in an e-mail (invitation, password reset): 32 random bytes.
 * Only its hash goes to the database; the token itself is only in the e-mail.
 */
export function newOneTimeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashOneTimeToken(token) };
}

export function hashOneTimeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
