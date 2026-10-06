import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

const TABS = [
  { label: 'Personel', link: 'personel' },
  { label: 'Cennik', link: 'cennik' },
  { label: 'Godziny otwarcia', link: 'godziny' },
  { label: 'Ogłoszenia', link: 'ogloszenia' },
  { label: 'Galeria', link: 'galeria' },
  { label: 'Wizytówka', link: 'wizytowka' },
  { label: 'Historia zmian', link: 'historia' },
];

/** `/panel/ustawienia/**`: tabs between the settings screens of the Właściciel. */
@Component({
  selector: 'app-settings-layout',
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Ustawienia">
      @for (tab of tabs; track tab.link) {
        <a
          mat-tab-link
          [routerLink]="tab.link"
          routerLinkActive
          #active="routerLinkActive"
          [active]="active.isActive"
          >{{ tab.label }}</a
        >
      }
    </nav>
    <mat-tab-nav-panel #panel>
      <router-outlet />
    </mat-tab-nav-panel>
  `,
  styles: `
    nav {
      margin-bottom: 16px;
    }
  `,
})
export class SettingsLayout {
  protected readonly tabs = TABS;
}
