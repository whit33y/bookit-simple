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
        canActivate: [roleGuard('OWNER')],
        loadComponent: () =>
          import('./settings/settings-layout').then((m) => m.SettingsLayout),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'personel' },
          {
            path: 'personel',
            title: 'Personel · Bookit',
            loadComponent: () =>
              import('./settings/staff-page').then((m) => m.StaffPage),
          },
          {
            path: 'cennik',
            title: 'Cennik · Bookit',
            loadComponent: () =>
              import('./settings/pricing-page').then((m) => m.PricingPage),
          },
          {
            path: 'godziny',
            title: 'Godziny otwarcia · Bookit',
            loadComponent: () =>
              import('./settings/opening-hours-page').then(
                (m) => m.OpeningHoursPage,
              ),
          },
          {
            path: 'ogloszenia',
            title: 'Ogłoszenia · Bookit',
            loadComponent: () =>
              import('./settings/announcements-page').then(
                (m) => m.AnnouncementsPage,
              ),
          },
          {
            path: 'galeria',
            title: 'Galeria · Bookit',
            loadComponent: () =>
              import('./settings/gallery-page').then((m) => m.GalleryPage),
          },
          {
            path: 'wizytowka',
            title: 'Wizytówka · Bookit',
            loadComponent: () =>
              import('./settings/page-settings-page').then(
                (m) => m.PageSettingsPage,
              ),
          },
        ],
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
      {
        path: 'salony/:id',
        title: 'Salon · Bookit',
        loadComponent: () =>
          import('./admin/salon-details-page').then((m) => m.SalonDetailsPage),
      },
    ],
  },
];
