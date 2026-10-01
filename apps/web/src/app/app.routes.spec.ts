import { RenderMode } from '@angular/ssr';
import { RESERVED_SLUGS } from '@bookit/shared';
import { appRoutes } from './app.routes';
import { serverRoutes } from './app.routes.server';

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

  it('ends with the Wizytówka and its klauzula RODO, then a 404 page for any other address', () => {
    expect(appRoutes.slice(-3).map((route) => route.path)).toEqual([
      ':slug/prywatnosc',
      ':slug',
      '**',
    ]);
  });
});

describe('serverRoutes', () => {
  it('renders every page that needs the session in the browser, the rest (Wizytówka) on the server', () => {
    const modeOf = (path: string) =>
      serverRoutes.find((route) => route.path === path)?.renderMode;

    for (const path of [
      'panel',
      'panel/**',
      'admin',
      'admin/**',
      'logowanie',
      'zaproszenie/**',
      'reset-hasla',
      'reset-hasla/**',
    ]) {
      expect(modeOf(path)).toBe(RenderMode.Client);
    }
    expect(serverRoutes.at(-1)).toEqual({
      path: '**',
      renderMode: RenderMode.Server,
    });
  });
});
