import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CLIENT_PHONE_TAKEN,
  CLIENT_SEARCH_LIMIT,
  ClientPhoneTakenResponse,
  ClientView,
  DELETED_CLIENT_NAME,
  normalizeName,
  parsePhone,
  PHONE_INVALID,
  phoneSearchDigits,
} from '@bookit/shared';
import { ClsService } from 'nestjs-cls';
import { Client, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import { VisitChangeRecorder } from '../visit-changes/visit-change-recorder';
import type { ClientChanges, ClientFields } from './clients.controller';

type Db = Pick<PrismaService, 'client'>;

const toView = (client: Client): ClientView => ({
  id: client.id,
  name: client.name,
  phoneE164: client.phoneE164,
  notes: client.notes,
});

const byName = [
  { nameNormalized: 'asc' },
  { createdAt: 'asc' },
] satisfies Prisma.ClientOrderByWithRelationInput[];

/** E.164, or `422` for a number that cannot be parsed. */
function toE164(phone: string | null): string | null {
  if (phone === null) return null;
  const parsed = parsePhone(phone);
  if (!parsed) throw new UnprocessableEntityException(PHONE_INVALID);
  return parsed.e164;
}

/**
 * The Kartoteka Klientów of the Salon from the context (#23). Queries are limited to
 * that Salon by the Prisma extension, so a Klient of another Salon is not found.
 * A deleted Klient stays only as "Klient usunięty" on past Wizyty.
 */
@Injectable()
export class ClientsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
    @Inject(VisitChangeRecorder)
    private readonly changes: VisitChangeRecorder,
  ) {}

  /** By name; `q` matches a part of the name or of the phone's digits. */
  async search(q: string): Promise<ClientView[]> {
    const name = normalizeName(q);
    const digits = phoneSearchDigits(q);
    const clients = await this.prisma.client.findMany({
      where: {
        deletedAt: null,
        ...(name && {
          OR: [
            { nameNormalized: { contains: name } },
            ...(digits ? [{ phoneE164: { contains: digits } }] : []),
          ],
        }),
      },
      orderBy: byName,
      take: CLIENT_SEARCH_LIMIT,
    });
    return clients.map(toView);
  }

  async get(id: string): Promise<ClientView> {
    return toView(await this.find(this.prisma, id));
  }

  async create(fields: ClientFields): Promise<ClientView> {
    const { acceptDuplicatePhone, phone, ...rest } = fields;
    const phoneE164 = toE164(phone);
    return this.prisma.$transaction(async (tx) => {
      if (phoneE164 && !acceptDuplicatePhone) {
        await this.checkPhoneFree(tx, phoneE164);
      }
      const client = await tx.client.create({
        data: {
          ...rest,
          nameNormalized: normalizeName(rest.name),
          phoneE164,
          // The create input type requires it; the Salon filter checks it is the context's.
          salonId: this.salonId(),
        },
      });
      return toView(client);
    });
  }

  /** A phone the Klient already has is not checked again. */
  async update(id: string, changes: ClientChanges): Promise<ClientView> {
    const { acceptDuplicatePhone, phone, ...rest } = changes;
    const phoneE164 = phone === undefined ? undefined : toE164(phone);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, id);
      if (
        phoneE164 &&
        phoneE164 !== current.phoneE164 &&
        !acceptDuplicatePhone
      ) {
        await this.checkPhoneFree(tx, phoneE164, id);
      }
      const updated = await tx.client.update({
        where: { id },
        data: {
          ...rest,
          ...(rest.name !== undefined && {
            nameNormalized: normalizeName(rest.name),
          }),
          ...(phoneE164 !== undefined && { phoneE164 }),
        },
      });
      return toView(updated);
    });
  }

  /**
   * An RODO request: the Klient keeps only "Klient usunięty", so past Wizyty show that.
   * Scheduled Wizyty from now on are deleted; cancelled ones stay in the history.
   * The Historia zmian keeps no name of theirs either.
   */
  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.find(tx, id);
      const now = new Date();
      await tx.visit.deleteMany({
        where: { clientId: id, state: 'SCHEDULED', startsAt: { gte: now } },
      });
      await this.changes.forgetClient(tx, id);
      await tx.client.update({
        where: { id },
        data: {
          deletedAt: now,
          name: DELETED_CLIENT_NAME,
          nameNormalized: normalizeName(DELETED_CLIENT_NAME),
          phoneE164: null,
          notes: null,
        },
      });
    });
  }

  /** `404` for a Klient of another Salon or a deleted one. */
  private async find(db: Db, id: string): Promise<Client> {
    const client = await db.client.findFirst({
      where: { id, deletedAt: null },
    });
    if (!client) throw new NotFoundException();
    return client;
  }

  /** `409` listing the other Klienci of the Salon with this phone. */
  private async checkPhoneFree(
    db: Db,
    phoneE164: string,
    exceptId?: string,
  ): Promise<void> {
    const clients = await db.client.findMany({
      where: {
        phoneE164,
        deletedAt: null,
        ...(exceptId && { id: { not: exceptId } }),
      },
      orderBy: byName,
    });
    if (clients.length === 0) return;
    const body: ClientPhoneTakenResponse = {
      statusCode: 409,
      error: 'Conflict',
      message: CLIENT_PHONE_TAKEN,
      clients: clients.map(toView),
    };
    throw new ConflictException(body);
  }

  private salonId(): string {
    const salonId = this.cls.get('salonId');
    if (!salonId) throw new Error('ClientsService needs a Salon context');
    return salonId;
  }
}
