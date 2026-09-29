import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { SalonContextGuard } from './salon-context.guard';

/**
 * Request context (`nestjs-cls`) and `SalonContextGuard` for every route.
 * `AuthModule` middleware runs before it and sets `req.user` from the session.
 */
@Module({
  imports: [ClsModule.forRoot({ global: true, middleware: { mount: true } })],
  providers: [{ provide: APP_GUARD, useClass: SalonContextGuard }],
})
export class SalonContextModule {}
