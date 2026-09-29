// PROTOTYPE (T10) variant A "Klasyczny Material": card login, top app bar + side list, bottom bar on phones.
import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MAIN_NAV, PERSON, SALON, VISITS } from './prototype-data';

@Component({
  selector: 'app-variant-a',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatToolbarModule,
  ],
  template: `
    @if (screen() === 'login') {
      <main class="login">
        <mat-card appearance="outlined" class="card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="logo">spa</mat-icon>
            <mat-card-title>Bookit</mat-card-title>
            <mat-card-subtitle>Zaloguj się do panelu Salonu</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline">
              <mat-label>E-mail</mat-label>
              <input matInput type="email" value="anna@studiokora.pl" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Hasło</mat-label>
              <input matInput type="password" value="xxxxxxxxxx" />
              <mat-icon matSuffix>visibility</mat-icon>
            </mat-form-field>
          </mat-card-content>
          <mat-card-actions>
            <a mat-button>Nie pamiętasz hasła?</a>
            <span class="grow"></span>
            <button mat-flat-button>Zaloguj się</button>
          </mat-card-actions>
        </mat-card>
      </main>
    } @else {
      <div class="shell">
        <mat-toolbar class="top">
          <mat-icon>spa</mat-icon>
          <span class="salon">{{ salon }}</span>
          <span class="grow"></span>
          <span class="who">{{ person }}</span>
          <button mat-icon-button aria-label="Konto"><mat-icon>account_circle</mat-icon></button>
        </mat-toolbar>
        <nav class="side">
          <mat-nav-list>
            @for (item of nav; track item.label; let first = $first) {
              <a mat-list-item [activated]="first">
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          </mat-nav-list>
        </nav>
        <main class="content">
          <h1>Kalendarz</h1>
          <p class="muted">wtorek, 29 września 2026</p>
          <mat-card appearance="outlined">
            <mat-list>
              @for (v of visits; track v.time) {
                <mat-list-item>
                  <span matListItemTitle>{{ v.time }} · {{ v.client }}</span>
                  <span matListItemLine>{{ v.service }} · {{ v.staff }}</span>
                </mat-list-item>
              }
            </mat-list>
          </mat-card>
        </main>
        <nav class="bottom">
          @for (item of nav; track item.label; let first = $first) {
            <a class="tab" [class.on]="first">
              <mat-icon>{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
      </div>
    }
  `,
  styles: `
    .grow { flex: 1; }
    .login { min-height: 100dvh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
      background: var(--mat-sys-surface-container); }
    .card { width: min(420px, 100%); padding: 8px; }
    .card mat-form-field { width: 100%; }
    .card mat-card-content { padding-top: 16px; }
    .logo { color: var(--mat-sys-primary); font-size: 40px; width: 40px; height: 40px; }

    .shell { display: grid; min-height: 100dvh; grid-template: 'top' auto 'content' 1fr 'bottom' auto / 1fr; }
    .top { grid-area: top; gap: 8px; background: var(--mat-sys-surface-container); position: sticky; top: 0; z-index: 2; }
    .salon { font-weight: 600; }
    .who { font-size: 14px; color: var(--mat-sys-on-surface-variant); }
    .side { grid-area: side; display: none; border-right: 1px solid var(--mat-sys-outline-variant); }
    .content { grid-area: content; padding: 16px 16px 24px; }
    .muted { color: var(--mat-sys-on-surface-variant); margin-top: -8px; }
    .bottom { grid-area: bottom; position: sticky; bottom: 0; display: flex; background: var(--mat-sys-surface-container);
      border-top: 1px solid var(--mat-sys-outline-variant); }
    .tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0 10px;
      font-size: 12px; color: var(--mat-sys-on-surface-variant); }
    .tab.on { color: var(--mat-sys-primary); font-weight: 600; }
    @media (min-width: 768px) {
      .shell { grid-template: 'top top' auto 'side content' 1fr / 240px 1fr; }
      .side { display: block; }
      .bottom { display: none; }
      .content { padding: 24px 32px; }
    }
    @media (max-width: 767.98px) { .who { display: none; } }
  `,
})
export class VariantA {
  readonly screen = input.required<'login' | 'panel'>();
  readonly nav = MAIN_NAV;
  readonly visits = VISITS;
  readonly salon = SALON;
  readonly person = PERSON;
}
