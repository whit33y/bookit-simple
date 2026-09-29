import { INestApplication } from '@nestjs/common';

export const GLOBAL_PREFIX = 'api';

export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  return app;
}
