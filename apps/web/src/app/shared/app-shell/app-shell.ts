import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

export interface NavItem {
  icon: string;
  label: string;
  link: string;
}

/**
 * Layout of the panel and the Administrator panel: top bar with the account menu,
 * a side menu from 768 px, a bottom navigation below. Pages go into `<ng-content>`.
 */
@Component({
  selector: 'app-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
  ],
  template: `
    <div class="shell">
      <mat-toolbar class="top">
        <mat-icon aria-hidden="true">spa</mat-icon>
        <span class="title">{{ title() }}</span>
        <span class="grow"></span>
        <span class="who">{{ userName() }}</span>
        <button
          mat-icon-button
          [matMenuTriggerFor]="account"
          aria-label="Konto"
        >
          <mat-icon>account_circle</mat-icon>
        </button>
        <mat-menu #account="matMenu" xPosition="before">
          <div class="menu-who" mat-menu-item disabled>{{ userName() }}</div>
          <button mat-menu-item (click)="logout()">
            <mat-icon>logout</mat-icon>
            <span>Wyloguj się</span>
          </button>
        </mat-menu>
      </mat-toolbar>

      <nav class="side" aria-label="Menu boczne">
        <mat-nav-list>
          @for (item of nav(); track item.link) {
            <a
              mat-list-item
              [routerLink]="item.link"
              routerLinkActive
              #rla="routerLinkActive"
              [activated]="rla.isActive"
              [attr.aria-current]="rla.isActive ? 'page' : null"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>
      </nav>

      <main class="content">
        <ng-content />
      </main>

      <nav class="bottom" aria-label="Nawigacja dolna">
        @for (item of nav(); track item.link) {
          <a
            class="tab"
            [routerLink]="item.link"
            routerLinkActive="active"
            #rla="routerLinkActive"
            [attr.aria-current]="rla.isActive ? 'page' : null"
          >
            <mat-icon aria-hidden="true">{{ item.icon }}</mat-icon>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: `
    .shell {
      /* mat-toolbar is 64 px tall, 56 px below 600 px. Sticky headers on pages sit under it. */
      --top-bar-height: 64px;
      display: grid;
      min-height: 100dvh;
      grid-template: 'top' auto 'content' 1fr 'bottom' auto / 1fr;
    }
    .grow {
      flex: 1;
    }
    .top {
      grid-area: top;
      gap: 8px;
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--mat-sys-surface-container);
    }
    .title {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .who {
      font-size: 14px;
      color: var(--mat-sys-on-surface-variant);
    }
    .side {
      grid-area: side;
      display: none;
      border-right: 1px solid var(--mat-sys-outline-variant);
    }
    .content {
      grid-area: content;
      padding: 16px 16px 24px;
      min-width: 0;
      /* Page z-indexes (calendar cards, the "now" line) stay under the top bar and the bottom navigation. */
      isolation: isolate;
    }
    .bottom {
      grid-area: bottom;
      position: sticky;
      bottom: 0;
      display: flex;
      background: var(--mat-sys-surface-container);
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 0 10px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
      text-decoration: none;
    }
    .tab.active {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    @media (max-width: 599.98px) {
      .shell {
        --top-bar-height: 56px;
      }
    }
    @media (max-width: 767.98px) {
      .who {
        display: none;
      }
    }
    @media (min-width: 768px) {
      .shell {
        grid-template: 'top top' auto 'side content' 1fr / 240px 1fr;
      }
      .side {
        display: block;
      }
      .bottom {
        display: none;
      }
      .content {
        padding: 24px 32px;
      }
    }
  `,
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly title = input.required<string>();
  readonly userName = input.required<string>();
  readonly nav = input.required<NavItem[]>();

  protected async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } finally {
      await this.router.navigateByUrl('/logowanie');
    }
  }
}
