import {
  Controller,
  Get,
  INestApplication,
  Module,
  NestMiddleware,
  NestModule,
  MiddlewareConsumer,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { AdminScope } from './admin-scope.decorator';
import { SalonContext } from './salon-context';
import { AuthenticatedUser } from './salon-context.guard';
import { SalonContextModule } from './salon-context.module';

/** Stands in for `CurrentUserMiddleware`: the `x-test-user` header becomes `req.user`. */
class FakeLoginMiddleware implements NestMiddleware {
  use(
    req: Request & { user?: AuthenticatedUser },
    _res: Response,
    next: NextFunction,
  ) {
    const header = req.header('x-test-user');
    if (header) req.user = JSON.parse(header) as AuthenticatedUser;
    next();
  }
}

@Controller()
class ProbeController {
  constructor(private readonly cls: ClsService<SalonContext>) {}

  private context(): SalonContext {
    return {
      salonId: this.cls.get('salonId'),
      staffMemberId: this.cls.get('staffMemberId'),
      role: this.cls.get('role'),
      isAdministrator: this.cls.get('isAdministrator'),
      adminScope: this.cls.get('adminScope'),
    };
  }

  @Get('panel')
  panel() {
    return this.context();
  }

  @Get('admin')
  @AdminScope()
  admin() {
    return this.context();
  }
}

@AdminScope()
@Controller('admin-controller')
class AdminProbeController {
  constructor(private readonly cls: ClsService<SalonContext>) {}

  @Get()
  get() {
    return { adminScope: this.cls.get('adminScope') };
  }
}

@Module({
  imports: [SalonContextModule],
  controllers: [ProbeController, AdminProbeController],
})
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FakeLoginMiddleware).forRoutes('*');
  }
}

describe('SalonContextGuard', () => {
  let app: INestApplication;

  const owner: AuthenticatedUser = {
    userId: '33333333-3333-4333-8333-333333333333',
    isAdministrator: false,
    salonId: '11111111-1111-4111-8111-111111111111',
    staffMemberId: '22222222-2222-4222-8222-222222222222',
    role: 'OWNER',
  };
  const administrator: AuthenticatedUser = {
    userId: '44444444-4444-4444-8444-444444444444',
    isAdministrator: true,
  };

  const as = (user: AuthenticatedUser) => ({
    'x-test-user': JSON.stringify(user),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("copies the Personel member's Salon into the request context", async () => {
    await request(app.getHttpServer())
      .get('/panel')
      .set(as(owner))
      .expect(200, {
        salonId: owner.salonId,
        staffMemberId: owner.staffMemberId,
        role: 'OWNER',
        isAdministrator: false,
      });
  });

  it('leaves the context without a Salon when nobody is logged in', async () => {
    await request(app.getHttpServer()).get('/panel').expect(200, {});
  });

  it('does not turn the filter off for an Administrator outside @AdminScope()', async () => {
    await request(app.getHttpServer())
      .get('/panel')
      .set(as(administrator))
      .expect(200, { isAdministrator: true });
  });

  it('sets adminScope on an @AdminScope() route for the Administrator', async () => {
    await request(app.getHttpServer())
      .get('/admin')
      .set(as(administrator))
      .expect(200, { isAdministrator: true, adminScope: true });
  });

  it('honours @AdminScope() on the controller class', async () => {
    await request(app.getHttpServer())
      .get('/admin-controller')
      .set(as(administrator))
      .expect(200, { adminScope: true });
  });

  it('rejects the Personel on an @AdminScope() route', async () => {
    await request(app.getHttpServer()).get('/admin').set(as(owner)).expect(403);
  });

  it('rejects an anonymous request on an @AdminScope() route', async () => {
    await request(app.getHttpServer()).get('/admin').expect(403);
  });
});
