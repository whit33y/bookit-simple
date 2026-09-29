import { Prisma } from '../../generated/prisma/client';
import { ISOLATED_MODELS } from './isolated-models';

/** Scalar fields per model, straight from the DMMF the Prisma Client was generated from. */
function scalarFields(model: Prisma.ModelName): string[] {
  const fields = (Prisma as unknown as Record<string, Record<string, string>>)[
    `${model}ScalarFieldEnum`
  ];
  return Object.values(fields);
}

describe('ISOLATED_MODELS', () => {
  it('lists exactly the models that have a salonId column', () => {
    const withSalonId = Object.values(Prisma.ModelName).filter((model) =>
      scalarFields(model).includes('salonId'),
    );

    expect([...ISOLATED_MODELS].sort()).toEqual(withSalonId.sort());
  });
});
