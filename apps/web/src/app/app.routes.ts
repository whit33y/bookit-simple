import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'app/prototyp',
    loadComponent: () =>
      import('./prototype/prototype-page').then((m) => m.PrototypePage),
  },
];
