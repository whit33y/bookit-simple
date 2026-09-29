import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Only the Wizytówka is rendered on the server. The panels and the pages for logging in
 * need the session, so they are rendered in the browser.
 */
const CLIENT_ROUTES = [
  'panel',
  'panel/**',
  'admin',
  'admin/**',
  'logowanie',
  'zaproszenie/**',
  'reset-hasla',
  'reset-hasla/**',
];

export const serverRoutes: ServerRoute[] = [
  ...CLIENT_ROUTES.map(
    (path): ServerRoute => ({ path, renderMode: RenderMode.Client }),
  ),
  { path: '**', renderMode: RenderMode.Server },
];
