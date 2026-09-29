import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ConfirmPasswordResetRequest,
  MIN_PASSWORD_LENGTH,
  PasswordResetRequest,
} from '@bookit/shared';
import { z } from 'zod';
import { Public } from '../auth/access.decorators';
import { LoginThrottlerGuard } from '../auth/login-throttler.guard';
import { PASSWORD_TOO_SHORT } from '../invitations/invitation.controller';
import { PasswordResetService } from './password-reset.service';

const requestSchema = z.object({
  email: z.string().min(1),
}) satisfies z.ZodType<PasswordResetRequest>;

const confirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT),
}) satisfies z.ZodType<ConfirmPasswordResetRequest>;

/** Public: the person cannot log in, that is why they are here. */
@Controller('auth/password-reset')
@Public()
export class PasswordResetController {
  constructor(
    @Inject(PasswordResetService) private readonly resets: PasswordResetService,
  ) {}

  /** `202` whether the account exists or not. Limited like login, per e-mail. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(LoginThrottlerGuard)
  request(@Body() body: unknown): void {
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    this.resets.request(parsed.data.email);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirm(@Body() body: unknown): Promise<void> {
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }
    await this.resets.confirm(parsed.data.token, parsed.data.password);
  }
}
