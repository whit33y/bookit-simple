import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { SalonContextGuard } from './salon-context.guard';

/**
 * Request context (`nestjs-cls`) and `SalonContextGuard` for every route.
 * The session guard from #6 must run before it, so `req.user` is set.
 */
@Global()
@Module({
  imports: [ClsModule.forRoot({ global: true, middleware: { mount: true } })],
  providers: [{ provide: APP_GUARD, useClass: SalonContextGuard }],
})
export class SalonContextModule {}
