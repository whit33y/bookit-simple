import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PRUNE_EVERY_MS = 60 * 60 * 1000;

/** Invalidates sessions in the database, which JWT could not do (docs/mvp.md, section 3). */
@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private pruneTimer?: NodeJS.Timeout;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Logs the person out on every device. */
  async destroyAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  /** Logs out the whole Personel of the Salon, e.g. when it is suspended. */
  async destroyAllForSalon(salonId: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: {
        user: { staffMembers: { some: { salonId, deletedAt: null } } },
      },
    });
  }

  async pruneExpired(): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  onModuleInit(): void {
    this.pruneTimer = setInterval(
      () => void this.pruneExpired().catch(() => undefined),
      PRUNE_EVERY_MS,
    );
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.pruneTimer);
  }
}
