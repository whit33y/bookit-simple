import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import { ISOLATED_MODELS } from './isolated-models';
import { SalonContext } from './salon-context';

/** A query on a Salon's data ran outside a Salon context and outside `@AdminScope()`. */
export class SalonContextMissingError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} needs a Salon context (SalonContextGuard) or @AdminScope()`,
    );
    this.name = 'SalonContextMissingError';
  }
}

/** A write tried to put a record into a Salon other than the one in the context. */
export class SalonIsolationError extends Error {
  constructor(model: string, operation: string) {
    super(`${model}.${operation} cannot write to another Salon`);
    this.name = 'SalonIsolationError';
  }
}

const isolated: ReadonlySet<string> = new Set(ISOLATED_MODELS);

type Args = Record<string, unknown>;
type Data = Record<string, unknown>;

/** Operations whose `where` gets `salonId`. `findUnique`, `update` and `delete` accept extra fields since Prisma 5. */
const FILTERED = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
  'upsert',
]);

/**
 * Limits every query on a model with `salonId` to the Salon from the context (ADR 0001).
 * Services do not filter by `salonId` themselves.
 *
 * Only top-level queries go through here. Nested reads and writes follow relations
 * from a record that already passed the filter.
 */
export function salonIsolation(cls: ClsService<SalonContext>) {
  return Prisma.defineExtension({
    name: 'salon-isolation',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!isolated.has(model) || cls.get('adminScope')) {
            return query(args);
          }
          const salonId = cls.get('salonId');
          if (!salonId) {
            throw new SalonContextMissingError(model, operation);
          }
          return query(scopeToSalon(model, operation, args as Args, salonId));
        },
      },
    },
  });
}

function scopeToSalon(
  model: string,
  operation: string,
  args: Args,
  salonId: string,
): Args {
  const scoped: Args = { ...args };
  const stamp = (data: unknown) =>
    stampSalonId(model, operation, data as Data, salonId);
  const guard = (data: unknown) =>
    guardSalonId(model, operation, data as Data, salonId);

  if (FILTERED.has(operation)) {
    scoped.where = { ...(args.where as Data | undefined), salonId };
  }
  switch (operation) {
    case 'create':
      scoped.data = stamp(args.data);
      break;
    case 'createMany':
    case 'createManyAndReturn':
      scoped.data = Array.isArray(args.data)
        ? args.data.map(stamp)
        : stamp(args.data);
      break;
    case 'upsert':
      scoped.create = stamp(args.create);
      guard(args.update);
      break;
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      guard(args.data);
      break;
  }
  return scoped;
}

/** New record: `salonId` comes from the context. */
function stampSalonId(
  model: string,
  operation: string,
  data: Data,
  salonId: string,
): Data {
  guardSalonId(model, operation, data, salonId);
  return { ...data, salonId };
}

/** A write may name the context's Salon, but never another one. */
function guardSalonId(
  model: string,
  operation: string,
  data: Data | undefined,
  salonId: string,
): void {
  if (!data) return;
  const salonIdValue = data.salonId;
  const target =
    typeof salonIdValue === 'object' && salonIdValue !== null
      ? (salonIdValue as { set?: unknown }).set
      : salonIdValue;
  if ('salon' in data || (target !== undefined && target !== salonId)) {
    throw new SalonIsolationError(model, operation);
  }
}
