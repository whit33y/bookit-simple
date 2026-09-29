import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { Env } from '../config/env';
import { createIsolatedPrismaClient, PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [ConfigService, ClsService],
      useFactory: (config: ConfigService<Env, true>, cls: ClsService) =>
        createIsolatedPrismaClient(
          config.get('DATABASE_URL', { infer: true }),
          cls,
        ),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule implements OnModuleDestroy {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
