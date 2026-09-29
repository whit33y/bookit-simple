import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { ClsModule, ClsService } from 'nestjs-cls';
import { validateEnv } from '../app/config/env';
import { InvitationService } from '../app/invitations/invitation.service';
import { PrismaService } from '../app/prisma/prisma.service';
import { SalonContext } from '../app/salon-context/salon-context';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../app/prisma/prisma.module';

/** Only what sending an invitation needs; `AppModule` does not start under `tsx`. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ClsModule.forRoot({ global: true }),
    PrismaModule,
    MailModule,
  ],
  providers: [InvitationService],
})
class InvitedOwnerModule {}

/**
 * For the Playwright tests (apps/web-e2e) until the Administrator can create a Salon (#11):
 * creates a Salon with a Właściciel and sends the invitation e-mail the usual way, to
 * Mailpit. Prints `{ email, salonName }` as JSON.
 *
 *   npx tsx --tsconfig apps/api/tsconfig.app.json apps/api/src/seed/e2e-invited-owner.ts
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(InvitedOwnerModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const cls = app.get<ClsService<SalonContext>>(ClsService);
    const id = randomUUID().slice(0, 8);
    const email = `wlasciciel-${id}@bookit.test`;
    const salonName = `Studio E2E ${id}`;

    await cls.run(async () => {
      cls.set('isAdministrator', true);
      cls.set('adminScope', true);
      const salon = await prisma.salon.create({
        data: { name: salonName, slug: `e2e-${id}` },
      });
      const user = await prisma.user.create({ data: { email } });
      const owner = await prisma.staffMember.create({
        data: {
          salonId: salon.id,
          userId: user.id,
          role: 'OWNER',
          displayName: 'Ewa',
        },
      });
      await app.get(InvitationService).createFor(owner.id);
    });
    console.log(JSON.stringify({ email, salonName }));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
