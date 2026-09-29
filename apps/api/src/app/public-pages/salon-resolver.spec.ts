import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import {
  createIsolatedPrismaClient,
  createPrismaClient,
} from '../prisma/prisma.service';
import { SalonContext } from '../salon-context/salon-context';
import { SalonResolver } from './salon-resolver';

describe('SalonResolver', () => {
  const url = process.env.DATABASE_URL ?? '';
  const raw = createPrismaClient(url);
  const cls = new ClsService<SalonContext>(new AsyncLocalStorage());
  const resolver = new SalonResolver(createIsolatedPrismaClient(url, cls));
  const host = 'bookit.test';

  /** The public endpoint runs under `@Public() @AdminScope()`. */
  const resolve = (path: string) =>
    cls.runWith({ adminScope: true }, () => resolver.resolve({ host, path }));

  const newSlug = () => `studio-${randomUUID().slice(0, 8)}`;
  const createSalon = (data: { status?: 'ACTIVE' | 'SUSPENDED' } = {}) =>
    raw.salon.create({ data: { name: 'Studio', slug: newSlug(), ...data } });

  afterAll(async () => {
    await raw.$disconnect();
  });

  it('finds the Salon by its current Adres wizytówki', async () => {
    const salon = await createSalon();

    await expect(resolve(`/${salon.slug}`)).resolves.toEqual({
      salon: expect.objectContaining({ id: salon.id, slug: salon.slug }),
    });
  });

  it('looks only at the first segment of the path', async () => {
    const salon = await createSalon();

    await expect(resolve(`/${salon.slug}/prywatnosc?x=1`)).resolves.toEqual({
      salon: expect.objectContaining({ id: salon.id }),
    });
  });

  it('sends an old Adres wizytówki to the current one', async () => {
    const salon = await createSalon();
    const oldSlug = newSlug();
    await raw.salonSlugRedirect.create({
      data: { oldSlug, salonId: salon.id },
    });

    await expect(resolve(`/${oldSlug}`)).resolves.toEqual({
      redirectTo: salon.slug,
    });
  });

  it('does not find a suspended Salon, by its current or old address', async () => {
    const salon = await createSalon({ status: 'SUSPENDED' });
    const oldSlug = newSlug();
    await raw.salonSlugRedirect.create({
      data: { oldSlug, salonId: salon.id },
    });

    await expect(resolve(`/${salon.slug}`)).resolves.toBeNull();
    await expect(resolve(`/${oldSlug}`)).resolves.toBeNull();
  });

  it.each([
    ['an unknown address', `/${newSlug()}`],
    ['a reserved name', '/panel'],
    ['an address that cannot exist', '/Studio_Kora'],
    ['an empty path', '/'],
    ['a query without a path', '/?studio-kora'],
  ])('does not find a Salon under %s', async (_, path) => {
    await expect(resolve(path)).resolves.toBeNull();
  });
});
