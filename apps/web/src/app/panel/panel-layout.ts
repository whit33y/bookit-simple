import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AppShell, NavItem } from '../shared/app-shell';

const STAFF_NAV: NavItem[] = [
  { icon: 'calendar_month', label: 'Kalendarz', link: '/panel', exact: true },
  { icon: 'group', label: 'Klienci', link: '/panel/klienci' },
];
const OWNER_NAV: NavItem[] = [
  ...STAFF_NAV,
  { icon: 'settings', label: 'Ustawienia', link: '/panel/ustawienia' },
];

/** `/panel/**`: the panel of the Personel. Ustawienia only for the Właściciel. */
@Component({
  selector: 'app-panel-layout',
  imports: [AppShell, RouterOutlet],
  template: `
    <app-shell [title]="salonName()" [userName]="userName()" [nav]="nav()">
      <router-outlet />
    </app-shell>
  `,
})
export class PanelLayout {
  private readonly me = inject(AuthService).me;

  protected readonly salonName = computed(() => this.me()?.salon?.name ?? '');
  protected readonly userName = computed(
    () => this.me()?.staffMember?.displayName ?? '',
  );
  protected readonly nav = computed(() =>
    this.me()?.role === 'OWNER' ? OWNER_NAV : STAFF_NAV,
  );
}
