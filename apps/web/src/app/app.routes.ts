import { Route } from '@angular/router';
import {
  adminGuard,
  authGuard,
  guestGuard,
  roleGuard,
} from './auth/auth.guards';

const placeholder = () =>
  import('./shared/placeholder-page').then((m) => m.PlaceholderPage);

// Every static top-level path must be in RESERVED_SLUGS (see app.routes.spec.ts),
// and the ones rendered in the browser listed in app.routes.server.ts.
export const appRoutes: Route[] = [
  {
    path: 'logowanie',
    title: 'Logowanie · Bookit',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'zaproszenie/:token',
    title: 'Zaproszenie · Bookit',
    loadComponent: () =>
      import('./auth/invitation-page').then((m) => m.InvitationPage),
  },
  {
    path: 'reset-hasla',
    title: 'Nie pamiętasz hasła? · Bookit',
    loadComponent: () =>
      import('./auth/password-reset-request-page').then(
        (m) => m.PasswordResetRequestPage,
      ),
  },
  {
    path: 'reset-hasla/:token',
    title: 'Nowe hasło · Bookit',
    loadComponent: () =>
      import('./auth/password-reset-confirm-page').then(
        (m) => m.PasswordResetConfirmPage,
      ),
  },
  {
    path: 'panel',
    canActivate: [authGuard, roleGuard('OWNER', 'EMPLOYEE')],
    loadComponent: () =>
      import('./panel/panel-layout').then((m) => m.PanelLayout),
    children: [
      {
        path: '',
        title: 'Kalendarz · Bookit',
        data: { heading: 'Kalendarz' },
        loadComponent: placeholder,
      },
      {
        path: 'klienci',
        title: 'Klienci · Bookit',
        data: { heading: 'Klienci' },
        loadComponent: placeholder,
      },
      {
        path: 'ustawienia',
        title: 'Ustawienia · Bookit',
        canActivate: [roleGuard('OWNER')],
        data: { heading: 'Ustawienia' },
        loadComponent: placeholder,
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./admin/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        title: 'Salony · Bookit',
        loadComponent: () =>
          import('./admin/salons-page').then((m) => m.SalonsPage),
      },
      {
        path: 'salony/nowy',
        title: 'Nowy Salon · Bookit',
        loadComponent: () =>
          import('./admin/new-salon-page').then((m) => m.NewSalonPage),
      },
    ],
  },
];
