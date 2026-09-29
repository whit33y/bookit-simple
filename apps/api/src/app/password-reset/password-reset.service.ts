import {
  BeforeApplicationShutdown,
  GoneException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'argon2';
import { MailService } from '../../mail/mail.service';
import { passwordResetEmail } from '../../mail/templates/password-reset';
import { normalizeEmail } from '../auth/auth.service';
import { hashOneTimeToken, newOneTimeToken } from '../auth/one-time-token';
import { SessionService } from '../auth/session.service';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** One message for an unknown, used, expired or replaced link. */
export const PASSWORD_RESET_GONE =
  'Link do zmiany hasła wygasł albo został już użyty';

/**
 * "Nie pamiętam hasła" for the Personel and the Administrator. Nothing the reply to
 * the request says or how long it takes tells whether the account exists.
 */
@Injectable()
export class PasswordResetService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly appUrl: string;
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true }).replace(/\/+$/, '');
  }

  /**
   * Returns at once. Looking the account up and sending the e-mail happen after the
   * reply, so an existing e-mail does not make the reply slower.
   */
  request(email: string): void {
    const job = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.sendLink(normalizeEmail(email)))
      .catch((err: unknown) =>
        this.logger.error('Password reset e-mail not sent', err),
      )
      .finally(() => this.pending.delete(job));
    this.pending.add(job);
  }

  /** Waits for the e-mails already asked for. */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.whenIdle();
  }

  /**
   * Sets the new password and uses the link up, once: of two requests racing with one
   * token, the second gets `410`. Then logs the person out on every device.
   */
  async confirm(token: string, password: string): Promise<void> {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashOneTimeToken(token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      throw new GoneException(PASSWORD_RESET_GONE);
    }
    const passwordHash = await hash(password);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count === 0) throw new GoneException(PASSWORD_RESET_GONE);
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
    });
    await this.sessions.destroyAllForUser(reset.userId);
  }

  /**
   * Only to someone who can log in: the Administrator or a person with a place in a
   * Personel. The StaffMember read nested under User is not filtered by Salon.
   */
  private async sendLink(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { staffMembers: { where: { deletedAt: null }, take: 1 } },
    });
    if (!user || (!user.isAdministrator && user.staffMembers.length === 0)) {
      return;
    }

    const { token, tokenHash } = newOneTimeToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    const { id } = await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    await this.mail.send({
      to: user.email,
      ...passwordResetEmail({
        link: `${this.appUrl}/reset-hasla/${token}`,
        expiresAt,
      }),
    });
    // Only after the e-mail went out, so a failed send leaves the previous link working.
    await this.prisma.passwordReset.deleteMany({
      where: { userId: user.id, usedAt: null, id: { not: id } },
    });
  }
}
