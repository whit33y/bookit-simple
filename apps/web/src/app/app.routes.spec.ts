import { RESERVED_SLUGS } from '@bookit/shared';
import { appRoutes } from './app.routes';

describe('appRoutes', () => {
  it('uses only reserved slugs for static top-level paths, so no Wizytówka is shadowed', () => {
    const staticTopLevelSegments = appRoutes
      .map((route) => route.path?.split('/')[0] ?? '')
      .filter(
        (segment) =>
          segment !== '' && segment !== '**' && !segment.startsWith(':'),
      );

    expect(RESERVED_SLUGS).toEqual(
      expect.arrayContaining(staticTopLevelSegments),
    );
  });
});
