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
  Query,
} from '@nestjs/common';
import {
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NAME_REQUIRED,
  CLIENT_NAME_TOO_LONG,
  CLIENT_NOTES_MAX_LENGTH,
  CLIENT_NOTES_TOO_LONG,
  ClientView,
  CreateClientRequest,
  PHONE_INVALID,
  UpdateClientRequest,
} from '@bookit/shared';
import { z } from 'zod';
import { Roles } from '../auth/access.decorators';
import { ClientsService } from './clients.service';

/** Empty text is the same as none. */
const optionalText = (schema: z.ZodString) =>
  schema
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value));

const fields = {
  name: z
    .string({ error: CLIENT_NAME_REQUIRED })
    .trim()
    .min(1, CLIENT_NAME_REQUIRED)
    .max(CLIENT_NAME_MAX_LENGTH, CLIENT_NAME_TOO_LONG),
  /** Parsed by the service, which answers `422` for an invalid number. */
  phone: optionalText(z.string({ error: PHONE_INVALID }).trim()),
  notes: optionalText(
    z
      .string({ error: CLIENT_NOTES_TOO_LONG })
      .trim()
      .max(CLIENT_NOTES_MAX_LENGTH, CLIENT_NOTES_TOO_LONG),
  ),
  acceptDuplicatePhone: z.boolean().default(false),
};

const createSchema = z.object({
  ...fields,
  phone: fields.phone.default(null),
  notes: fields.notes.default(null),
}) satisfies z.ZodType<unknown, CreateClientRequest>;

/** Fields left out stay as they are. */
const updateSchema = z.object({
  name: fields.name.optional(),
  phone: fields.phone.optional(),
  notes: fields.notes.optional(),
  acceptDuplicatePhone: fields.acceptDuplicatePhone,
}) satisfies z.ZodType<unknown, UpdateClientRequest>;

export type ClientFields = z.output<typeof createSchema>;
export type ClientChanges = z.output<typeof updateSchema>;

/** `400` for a malformed body; only the picked fields reach the service. */
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

/**
 * `/api/clients`: the Kartoteka Klientów of the Salon. The Personel adds and edits,
 * only the Właściciel deletes (an RODO request).
 */
@Controller('clients')
export class ClientsController {
  constructor(
    @Inject(ClientsService) private readonly clients: ClientsService,
  ) {}

  /** Up to `CLIENT_SEARCH_LIMIT` by name; `q` matches the name or digits of the phone. */
  @Get()
  search(@Query('q') q: unknown): Promise<ClientView[]> {
    return this.clients.search(typeof q === 'string' ? q : '');
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ClientView> {
    return this.clients.get(id);
  }

  /** `422` for an invalid phone, `409` for one another Klient has. */
  @Post()
  create(@Body() body: unknown): Promise<ClientView> {
    return this.clients.create(parse(createSchema, body));
  }

  /** `422` for an invalid phone, `409` for one another Klient has. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ClientView> {
    return this.clients.update(id, parse(updateSchema, body));
  }

  @Delete(':id')
  @Roles('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.clients.remove(id);
  }
}
