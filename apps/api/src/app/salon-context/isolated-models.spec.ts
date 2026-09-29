import { Prisma } from '../../generated/prisma/client';
import {
  GLOBAL_MODELS,
  ISOLATED_MODELS,
  SALON_LINKED_MODELS,
} from './isolated-models';

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

  it('together with the linked and global models covers every model once', () => {
    const classified = [
      ...ISOLATED_MODELS,
      ...Object.keys(SALON_LINKED_MODELS),
      ...GLOBAL_MODELS,
    ];

    expect(classified.sort()).toEqual(Object.values(Prisma.ModelName).sort());
  });
});
