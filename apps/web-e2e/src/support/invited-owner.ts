import { APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { WORKSPACE_ROOT } from '../../playwright.config';
import { linkSentTo } from './mailpit';

export const PASSWORD = 'haslo-do-testow-e2e';

export interface InvitedOwner {
  email: string;
  salonName: string;
}

/**
 * A new Salon with a Właściciel who got the invitation e-mail but has not set a password.
 * Until the Administrator can create a Salon in the app (#11), a script does it.
 */
export function invitedOwner(): InvitedOwner {
  const output = execFileSync(
    'npx',
    [
      'tsx',
      '--tsconfig',
      'apps/api/tsconfig.app.json',
      'apps/api/src/seed/e2e-invited-owner.ts',
    ],
    { cwd: WORKSPACE_ROOT, encoding: 'utf8' },
  );
  return JSON.parse(output.trim().split('\n').at(-1) ?? '') as InvitedOwner;
}

/** A Właściciel who has set `PASSWORD`, logged in on `request` (and so its page). */
export async function loggedInOwner(
  request: APIRequestContext,
): Promise<InvitedOwner> {
  const owner = invitedOwner();
  const link = await linkSentTo(owner.email, 'zaproszenie');
  const token = link.split('/').at(-1);
  const response = await request.post('/api/auth/accept-invitation', {
    data: { token, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`accept-invitation: ${response.status()}`);
  }
  return owner;
}
