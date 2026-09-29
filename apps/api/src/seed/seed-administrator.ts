import { hash } from 'argon2';
import { PrismaClient } from '../generated/prisma/client';

export interface AdministratorCredentials {
  email: string;
  password: string;
}

/**
 * Creates the Administrator, or marks an existing account with that e-mail as one.
 * A second run does not overwrite the password, so one changed later in the app survives.
 */
export async function seedAdministrator(
  prisma: PrismaClient,
  { email, password }: AdministratorCredentials,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  await prisma.user.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      passwordHash: await hash(password),
      isAdministrator: true,
    },
    update: { isAdministrator: true },
  });
}
