import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AppShell, NavItem } from '../shared/app-shell';

const ADMIN_NAV: NavItem[] = [
  { icon: 'storefront', label: 'Salony', link: '/admin' },
];

/** `/admin/**`: the panel of the Administrator. */
@Component({
  selector: 'app-admin-layout',
  imports: [AppShell, RouterOutlet],
  template: `
    <app-shell title="Bookit · Administrator" [userName]="email()" [nav]="nav">
      <router-outlet />
    </app-shell>
  `,
})
export class AdminLayout {
  private readonly me = inject(AuthService).me;

  protected readonly email = computed(() => this.me()?.user.email ?? '');
  protected readonly nav = ADMIN_NAV;
}
