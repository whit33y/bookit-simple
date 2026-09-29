import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import { ISOLATED_MODELS, SALON_LINKED_MODELS } from './isolated-models';
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

type Args = Record<string, unknown>;

const isolatedModels: ReadonlySet<string> = new Set(ISOLATED_MODELS);
const linkedModelFilters: Partial<Record<string, (salonId: string) => object>> =
  SALON_LINKED_MODELS;

/** Operations with a `where`. `findUnique`, `update` and `delete` accept extra fields since Prisma 5. */
const WHERE_OPERATIONS = new Set([
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

/** The query being scoped and the Salon it is limited to. */
interface Scope {
  model: string;
  operation: string;
  salonId: string;
}

/**
 * Limits every query on a Salon's data to the Salon from the context (ADR 0001).
 * Services do not filter by `salonId` themselves.
 *
 * Only top-level queries go through here. Nested reads and writes are safe because
 * every model they can start from is filtered too (`SALON_LINKED_MODELS`).
 * Raw SQL (`$queryRaw`) is not filtered.
 */
export function salonIsolation(cls: ClsService<SalonContext>) {
  return Prisma.defineExtension({
    name: 'salon-isolation',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (cls.get('adminScope')) return query(args);
          const salonId = cls.get('salonId');

          if (isolatedModels.has(model)) {
            if (!salonId) throw new SalonContextMissingError(model, operation);
            return query(
              scopeIsolated({ model, operation, salonId }, args as Args),
            );
          }
          const linkedFilter = linkedModelFilters[model];
          if (linkedFilter && salonId) {
            return query(
              scopeLinked(
                { model, operation, salonId },
                args as Args,
                linkedFilter,
              ),
            );
          }
          return query(args);
        },
      },
    },
  });
}

/** Model with `salonId`: filter reads, stamp new records, refuse moves to another Salon. */
function scopeIsolated(scope: Scope, args: Args): Args {
  const { operation, salonId } = scope;
  const scoped: Args = { ...args };
  const stamp = (data: unknown) => stampSalonId(scope, data as Args);
  const rejectForeign = (data: unknown) =>
    rejectForeignSalonId(scope, data as Args | undefined);

  if (WHERE_OPERATIONS.has(operation)) {
    scoped.where = { ...(args.where as Args | undefined), salonId };
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
      rejectForeign(args.update);
      break;
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      rejectForeign(args.data);
      break;
  }
  return scoped;
}

/** Model linked through its id or a parent: `AND` keeps the caller's own filter on that field. */
function scopeLinked(
  { operation, salonId }: Scope,
  args: Args,
  linkedFilter: (salonId: string) => object,
): Args {
  if (!WHERE_OPERATIONS.has(operation)) return args;
  const where = (args.where ?? {}) as Args;
  const and = where.AND === undefined ? [] : [where.AND].flat();
  return { ...args, where: { ...where, AND: [...and, linkedFilter(salonId)] } };
}

/** New record: `salonId` comes from the context. */
function stampSalonId(scope: Scope, data: Args): Args {
  rejectForeignSalonId(scope, data);
  return { ...data, salonId: scope.salonId };
}

/** A write may name the context's Salon, but never another one. */
function rejectForeignSalonId(
  { model, operation, salonId }: Scope,
  data: Args | undefined,
): void {
  if (!data) return;
  const requested =
    typeof data.salonId === 'object' && data.salonId !== null
      ? (data.salonId as { set?: unknown }).set
      : data.salonId;
  if ('salon' in data || (requested !== undefined && requested !== salonId)) {
    throw new SalonIsolationError(model, operation);
  }
}
