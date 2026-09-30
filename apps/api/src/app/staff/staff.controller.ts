import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  InviteStaffRequest,
  STAFF_BIO_MAX_LENGTH,
  STAFF_KEEP_VISITS_REQUIRED,
  STAFF_ROLES,
  StaffDeletionPreview,
  StaffMemberView,
  StaffOrderRequest,
  UpdateStaffRequest,
} from '@bookit/shared';
import { z } from 'zod';
import { Roles } from '../auth/access.decorators';
import {
  NewStaffMember,
  StaffMemberChanges,
  StaffService,
} from './staff.service';

const MAX_NAME_LENGTH = 200;

const displayName = z
  .string({ error: 'Wpisz imię' })
  .trim()
  .min(1, 'Wpisz imię')
  .max(MAX_NAME_LENGTH, `Imię może mieć najwyżej ${MAX_NAME_LENGTH} znaków`);

const role = z.enum(STAFF_ROLES, { error: 'Wybierz rolę' });

const inviteSchema = z.object({
  displayName,
  email: z
    .string({ error: 'Nieprawidłowy e-mail' })
    .trim()
    .toLowerCase()
    .pipe(z.email('Nieprawidłowy e-mail')),
  role,
}) satisfies z.ZodType<NewStaffMember, InviteStaffRequest>;

const updateSchema = z.object({
  displayName: displayName.optional(),
  role: role.optional(),
  acceptsVisits: z.boolean().optional(),
  showOnPage: z.boolean().optional(),
  photoId: z.uuid('Nieprawidłowe zdjęcie').nullable().optional(),
  /** Blank is `null`. */
  bio: z
    .string()
    .trim()
    .max(
      STAFF_BIO_MAX_LENGTH,
      `Opis może mieć najwyżej ${STAFF_BIO_MAX_LENGTH} znaków`,
    )
    .nullable()
    .transform((value) => value || null)
    .optional(),
}) satisfies z.ZodType<StaffMemberChanges, UpdateStaffRequest>;

const orderSchema = z.object({
  ids: z.array(z.string()),
}) satisfies z.ZodType<StaffOrderRequest>;

/** The Właściciel decides explicitly; anything but `true` or `false` is `400`. */
const keepVisitsSchema = z
  .enum(['true', 'false'], { error: STAFF_KEEP_VISITS_REQUIRED })
  .transform((value) => value === 'true');

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

/** `/api/staff`: the Właściciel manages the Personel; the Pracownik only sees it. */
@Controller('staff')
@Roles('OWNER')
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get()
  @Roles('OWNER', 'EMPLOYEE')
  list(): Promise<StaffMemberView[]> {
    return this.staff.list();
  }

  @Post('invite')
  invite(@Body() body: unknown): Promise<StaffMemberView> {
    return this.staff.invite(parse(inviteSchema, body));
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() body: unknown): Promise<void> {
    return this.staff.reorder(parse(orderSchema, body).ids);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<StaffMemberView> {
    return this.staff.update(id, parse(updateSchema, body));
  }

  @Get(':id/deletion-preview')
  deletionPreview(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffDeletionPreview> {
    return this.staff.deletionPreview(id);
  }

  /** `?keepVisits=true|false`: whether her Wizyty stay in the calendar. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('keepVisits') keepVisits: unknown,
  ): Promise<void> {
    return this.staff.remove(id, parse(keepVisitsSchema, keepVisits));
  }

  @Post(':id/resend-invitation')
  @HttpCode(HttpStatus.NO_CONTENT)
  resendInvitation(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.staff.resendInvitation(id);
  }
}
