import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  AcceptInvitationRequest,
  InvitationResponse,
  MeResponse,
  MIN_PASSWORD_LENGTH,
} from '@bookit/shared';
import { Request } from 'express';
import { z } from 'zod';
import { Public } from '../auth/access.decorators';
import { AuthService } from '../auth/auth.service';
import { startSession } from '../auth/session-helpers';
import { InvitationService } from './invitation.service';

export const PASSWORD_TOO_SHORT = `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`;

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT),
}) satisfies z.ZodType<AcceptInvitationRequest>;

/** Public: the invited person has no session yet. */
@Controller('auth')
@Public()
export class InvitationController {
  constructor(
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get('invitations/:token')
  describe(@Param('token') token: string): Promise<InvitationResponse> {
    return this.invitations.describe(token);
  }

  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<MeResponse> {
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }
    const identity = await this.invitations.accept(
      parsed.data.token,
      parsed.data.password,
    );
    await startSession(req, identity);
    return this.auth.me(identity);
  }
}
