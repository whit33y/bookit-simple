import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { LoginRequest, MeResponse } from '@bookit/shared';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedUser } from '../salon-context/salon-context.guard';
import { AuthService } from './auth.service';
import { AuthenticatedGuard } from './authenticated.guard';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { destroySession, startSession } from './session-helpers';
import { SESSION_COOKIE } from './session.middleware';

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
}) satisfies z.ZodType<LoginRequest>;

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginThrottlerGuard)
  async login(@Body() body: unknown, @Req() req: Request): Promise<MeResponse> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const identity = await this.auth.login(
      parsed.data.email,
      parsed.data.password,
    );
    await startSession(req, identity);
    return this.auth.me(identity);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (req.session) await destroySession(req);
    res.clearCookie(SESSION_COOKIE);
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  me(@Req() req: Request & { user: AuthenticatedUser }): Promise<MeResponse> {
    return this.auth.me({
      userId: req.user.userId,
      staffMemberId: req.user.staffMemberId,
    });
  }
}
