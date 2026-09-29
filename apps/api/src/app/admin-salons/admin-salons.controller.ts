import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  AdminSalonDetails,
  AdminSalonSummary,
  CreateSalonResponse,
  parsePhone,
  PHONE_INVALID,
  POSTAL_CODE_INVALID,
  POSTAL_CODE_PATTERN,
  SLUG_ERROR_MESSAGES,
  SlugAvailabilityResponse,
  validateSlug,
} from '@bookit/shared';
import { z } from 'zod';
import { AdminOnly } from '../auth/access.decorators';
import { AdminSalonsService, NewSalon } from './admin-salons.service';

const MAX_TEXT_LENGTH = 200;
const TEXT_TOO_LONG = `Tekst może mieć najwyżej ${MAX_TEXT_LENGTH} znaków`;

const required = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(MAX_TEXT_LENGTH, TEXT_TOO_LONG);

/** Missing, `null` or blank is `null`. */
const optional = z
  .string()
  .trim()
  .max(MAX_TEXT_LENGTH, TEXT_TOO_LONG)
  .nullish()
  .transform((value) => value || null);

const createSchema = z.object({
  name: required('Wpisz nazwę Salonu'),
  slug: z
    .string({ error: SLUG_ERROR_MESSAGES.TOO_SHORT })
    .superRefine((slug, ctx) => {
      const error = validateSlug(slug);
      if (error)
        ctx.addIssue({ code: 'custom', message: SLUG_ERROR_MESSAGES[error] });
    }),
  ownerName: required('Wpisz imię Właściciela'),
  ownerEmail: z
    .string({ error: 'Nieprawidłowy e-mail' })
    .trim()
    .toLowerCase()
    .pipe(z.email('Nieprawidłowy e-mail')),
  phone: optional.transform((raw, ctx) => {
    if (raw === null) return null;
    const phone = parsePhone(raw);
    if (!phone) ctx.addIssue({ code: 'custom', message: PHONE_INVALID });
    return phone?.e164 ?? null;
  }),
  email: optional.pipe(
    z.email('Nieprawidłowy e-mail Salonu').toLowerCase().nullable(),
  ),
  street: optional,
  postalCode: optional.pipe(
    z.string().regex(POSTAL_CODE_PATTERN, POSTAL_CODE_INVALID).nullable(),
  ),
  city: optional,
}) satisfies z.ZodType<NewSalon, unknown>;

@Controller('admin/salons')
@AdminOnly()
export class AdminSalonsController {
  constructor(
    @Inject(AdminSalonsService) private readonly salons: AdminSalonsService,
  ) {}

  @Get()
  list(): Promise<AdminSalonSummary[]> {
    return this.salons.list();
  }

  /** For the live check in the form. A missing `slug` is too short. */
  @Get('slug-available')
  slugAvailable(
    @Query('slug') slug: unknown,
  ): Promise<SlugAvailabilityResponse> {
    return this.salons.slugAvailability(typeof slug === 'string' ? slug : '');
  }

  @Post()
  create(@Body() body: unknown): Promise<CreateSalonResponse> {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }
    return this.salons.create(parsed.data);
  }

  @Get(':id')
  details(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminSalonDetails> {
    return this.salons.details(id);
  }

  /** Also logs the Personel out. */
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminSalonDetails> {
    return this.salons.suspend(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@Param('id', ParseUUIDPipe) id: string): Promise<AdminSalonDetails> {
    return this.salons.resume(id);
  }

  @Post(':id/resend-invitation')
  @HttpCode(HttpStatus.NO_CONTENT)
  resendInvitation(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.salons.resendInvitation(id);
  }
}
