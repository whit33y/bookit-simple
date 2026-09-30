/**
 * Permission matrix of the whole API (docs/mvp.md, section 2).
 *
 * Every endpoint has one row in `MATRIX`:
 *
 *     [method, path, allowed]
 *
 * - `method`: `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`
 * - `path`: full path with the `/api` prefix; put any valid-looking id in place of a
 *   parameter, e.g. `/api/staff/00000000-0000-4000-8000-000000000000`
 * - `allowed`: who gets in: `ANONYMOUS`, `ADMINISTRATOR`, `OWNER`, `EMPLOYEE`.
 *   `PUBLIC` is shorthand for all four.
 *
 * One loop sends every row once as each of the four and expects:
 * - allowed: anything but `401` and `403` (the empty body usually ends in `400` or `404`,
 *   which still proves the guards let the request through);
 * - not allowed: `401` for `ANONYMOUS`, `403` for everyone else.
 *
 * The four log in once and share their sessions across rows, so a row must not end a
 * session or change its person (e.g. `POST /api/auth/logout` is not listed; its own
 * spec covers it). Requests carry no body, so they should not change any data.
 *
 * Every task that adds endpoints adds their rows here. For now the only rows are
 * the test controllers below, one per access decorator.
 */
import {
  Controller,
  Get,
  INestApplication,
  Inject,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import {
  AdminOnly,
  AnyRole,
  Public,
  Role,
  Roles,
} from '../src/app/auth/access.decorators';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/app/configure-app';
import { createPrismaClient } from '../src/app/prisma/prisma.service';
import { SalonContext } from '../src/app/salon-context/salon-context';

type Person = 'ANONYMOUS' | Role;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Row = [method: Method, path: string, allowed: readonly Person[]];

/** Everyone each row is sent as. */
const PEOPLE: readonly Person[] = [
  'ANONYMOUS',
  'ADMINISTRATOR',
  'OWNER',
  'EMPLOYEE',
];
const PUBLIC = PEOPLE;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

const MATRIX: Row[] = [
  // Test controllers, one route per access decorator.
  ['GET', '/api/test-access/public', PUBLIC],
  ['GET', '/api/test-access/default', ['OWNER', 'EMPLOYEE']],
  ['GET', '/api/test-access/owner', ['OWNER']],
  ['GET', '/api/test-access/staff', ['OWNER', 'EMPLOYEE']],
  ['GET', '/api/test-access/admin', ['ADMINISTRATOR']],
  ['GET', '/api/test-access/any-role', ['ADMINISTRATOR', 'OWNER', 'EMPLOYEE']],
  ['GET', '/api/test-access-owner', ['OWNER']],
  ['GET', '/api/test-access-owner/public', PUBLIC],
  ['GET', '/api/test-access-owner/staff', ['OWNER', 'EMPLOYEE']],
  ['GET', '/api/test-access-admin', ['ADMINISTRATOR']],

  // T06: sessions and login
  ['POST', '/api/auth/login', PUBLIC],
  ['GET', '/api/auth/me', ['ADMINISTRATOR', 'OWNER', 'EMPLOYEE']],

  // T07: invitations and setting the password
  ['GET', '/api/auth/invitations/not-a-token', PUBLIC],
  ['POST', '/api/auth/accept-invitation', PUBLIC],

  // T11: creating a Salon by the Administrator
  [
    'GET',
    '/api/admin/salons/slug-available?slug=studio-kora',
    ['ADMINISTRATOR'],
  ],
  ['POST', '/api/admin/salons', ['ADMINISTRATOR']],

  // T12: list and details of Salons, suspending (unknown id, so nothing changes)
  ['GET', '/api/admin/salons', ['ADMINISTRATOR']],
  ['GET', `/api/admin/salons/${UNKNOWN_ID}`, ['ADMINISTRATOR']],
  ['POST', `/api/admin/salons/${UNKNOWN_ID}/suspend`, ['ADMINISTRATOR']],
  ['POST', `/api/admin/salons/${UNKNOWN_ID}/resume`, ['ADMINISTRATOR']],
  [
    'POST',
    `/api/admin/salons/${UNKNOWN_ID}/resend-invitation`,
    ['ADMINISTRATOR'],
  ],

  // T13: changing the Adres wizytówki (no body, so 400 for the Administrator)
  ['PATCH', `/api/admin/salons/${UNKNOWN_ID}`, ['ADMINISTRATOR']],

  // T34: the Wizytówka (unknown address, so 404)
  ['GET', '/api/public/pages/nieznany-salon', PUBLIC],

  // Health check for the hosting
  ['GET', '/api/health', PUBLIC],
];

@Controller('test-access')
class TestAccessController {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  @Get('public')
  @Public()
  public() {
    return {};
  }

  @Get('default')
  default() {
    return {};
  }

  @Get('owner')
  @Roles('OWNER')
  owner() {
    return {};
  }

  @Get('staff')
  @Roles('OWNER', 'EMPLOYEE')
  staff() {
    return {};
  }

  @Get('admin')
  @AdminOnly()
  admin() {
    return { adminScope: this.cls.get('adminScope') ?? false };
  }

  @Get('any-role')
  @AnyRole()
  anyRole() {
    return {};
  }
}

/** A decorator on the controller applies to every route; one on a route replaces it. */
@Controller('test-access-owner')
@Roles('OWNER')
class TestAccessOwnerController {
  @Get()
  get() {
    return {};
  }

  @Get('public')
  @Public()
  public() {
    return {};
  }

  @Get('staff')
  @Roles('OWNER', 'EMPLOYEE')
  staff() {
    return {};
  }
}

@Controller('test-access-admin')
@AdminOnly()
class TestAccessAdminController {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService<SalonContext>,
  ) {}

  @Get()
  get() {
    return { adminScope: this.cls.get('adminScope') ?? false };
  }
}

@Module({
  controllers: [
    TestAccessController,
    TestAccessOwnerController,
    TestAccessAdminController,
  ],
})
class TestAccessModule {}

const PASSWORD = 'correct horse battery staple';

describe('permission matrix', () => {
  const raw = createPrismaClient(process.env.DATABASE_URL ?? '');
  let app: INestApplication;
  const clients = new Map<Person, ReturnType<typeof request.agent>>();

  async function logIn(person: Role, salonId: string, passwordHash: string) {
    const email = `${person.toLowerCase()}-${randomUUID()}@bookit.test`;
    const user = await raw.user.create({
      data: {
        email,
        passwordHash,
        isAdministrator: person === 'ADMINISTRATOR',
      },
    });
    if (person !== 'ADMINISTRATOR') {
      await raw.staffMember.create({
        data: { salonId, userId: user.id, role: person, displayName: person },
      });
    }
    const client = request.agent(app.getHttpServer());
    await client
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    clients.set(person, client);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TestAccessModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();

    const passwordHash = await hash(PASSWORD);
    const salon = await raw.salon.create({
      data: { name: 'Studio Anna', slug: `test-${randomUUID()}` },
    });
    clients.set('ANONYMOUS', request.agent(app.getHttpServer()));
    for (const person of ['ADMINISTRATOR', 'OWNER', 'EMPLOYEE'] as const) {
      await logIn(person, salon.id, passwordHash);
    }
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  const send = (person: Person, method: Method, path: string) => {
    const client = clients.get(person);
    if (!client) throw new Error(`${person} is not logged in`);
    const verb = method.toLowerCase() as Lowercase<Method>;
    return client[verb](path);
  };

  const cases = MATRIX.flatMap(([method, path, allowed]) =>
    PEOPLE.map((person) => ({
      method,
      path,
      person,
      allowed: allowed.includes(person),
    })),
  );

  it.each(cases)(
    '$method $path as $person: allowed=$allowed',
    async ({ method, path, person, allowed }) => {
      const res = await send(person, method, path);
      // The body goes along, so a failure shows why, e.g. the message of a `500`.
      const reply = { status: res.status, body: res.body as unknown };

      if (allowed) {
        expect([401, 403]).not.toContain(reply.status);
      } else {
        expect(reply).toMatchObject({
          status: person === 'ANONYMOUS' ? 401 : 403,
        });
      }
    },
  );

  it.each(['/api/test-access/admin', '/api/test-access-admin'])(
    '@AdminOnly() on %s also turns on @AdminScope()',
    async (path) => {
      await send('ADMINISTRATOR', 'GET', path).expect(200, {
        adminScope: true,
      });
    },
  );
});
