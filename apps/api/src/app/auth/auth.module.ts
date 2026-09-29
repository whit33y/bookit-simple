import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CurrentUserMiddleware } from './current-user.middleware';
import { LOGIN_THROTTLE } from './login-throttler.guard';
import { PrismaSessionStore } from './prisma-session.store';
import { SessionMiddleware } from './session.middleware';
import { SessionService } from './session.service';

/**
 * Login with e-mail and password, sessions in Postgres (ADR 0005).
 * Its middleware runs before every guard, so `req.user` is set for `SalonContextGuard`.
 */
@Module({
  imports: [ThrottlerModule.forRoot([LOGIN_THROTTLE])],
  controllers: [AuthController],
  providers: [AuthService, PrismaSessionStore, SessionService],
  exports: [SessionService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('{*path}');
    consumer
      .apply(CurrentUserMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/logout', method: RequestMethod.POST },
      )
      .forRoutes('{*path}');
  }
}
