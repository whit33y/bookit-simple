// PROTOTYPE (T10) variant C "Recepcja": no-card login on a plain page, dark sidebar with Salon
// header and grouped Właściciel settings, dense table; on phones a label-only bottom bar with "Więcej".
import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PERSON, SALON, SETTINGS_NAV, VISITS } from './prototype-data';

@Component({
  selector: 'app-variant-c',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="theme-c">
      @if (screen() === 'login') {
        <main class="login">
          <div class="logo"><span class="dot"></span> Bookit</div>
          <div class="inner">
            <h1>Logowanie</h1>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>E-mail</mat-label>
              <input matInput type="email" value="anna@studiokora.pl" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Hasło</mat-label>
              <input matInput type="password" value="xxxxxxxxxx" />
            </mat-form-field>
            <div class="row">
              <a class="link">Nie pamiętasz hasła?</a>
              <button mat-flat-button>Zaloguj się</button>
            </div>
          </div>
          <p class="foot">Nie masz konta? Poproś Właściciela Salonu o zaproszenie.</p>
        </main>
      } @else {
        <div class="shell">
          <aside class="side">
            <div class="salon">
              <span class="avatar">SK</span>
              <div><strong>{{ salon }}</strong><small>{{ person }} · Właściciel</small></div>
            </div>
            <a class="item on"><mat-icon>calendar_month</mat-icon>Kalendarz</a>
            <a class="item"><mat-icon>group</mat-icon>Klienci</a>
            <p class="group">Ustawienia</p>
            @for (item of settings; track item.label) {
              <a class="item"><mat-icon>{{ item.icon }}</mat-icon>{{ item.label }}</a>
            }
            <span class="grow"></span>
            <a class="item"><mat-icon>logout</mat-icon>Wyloguj</a>
          </aside>
          <main class="content">
            <div class="bar">
              <h1>Kalendarz</h1>
              <span class="grow"></span>
              <button mat-stroked-button><mat-icon>chevron_left</mat-icon></button>
              <button mat-stroked-button>Dziś</button>
              <button mat-stroked-button><mat-icon>chevron_right</mat-icon></button>
              <button mat-flat-button class="add"><mat-icon>add</mat-icon>Wizyta</button>
            </div>
            <table>
              <thead><tr><th>Godzina</th><th>Klient</th><th>Usługa</th><th>Osoba</th></tr></thead>
              <tbody>
                @for (v of visits; track v.time) {
                  <tr><td>{{ v.time }}</td><td>{{ v.client }}</td><td>{{ v.service }}</td><td>{{ v.staff }}</td></tr>
                }
              </tbody>
            </table>
          </main>
          <nav class="bottom">
            <a class="on">Kalendarz</a><a>Klienci</a><a>Ustawienia</a><a>Więcej</a>
          </nav>
        </div>
      }
    </div>
  `,
  styles: `
    @use '@angular/material' as mat;
    .theme-c {
      @include mat.theme((color: (primary: mat.$cyan-palette, tertiary: mat.$green-palette), density: -2));
      min-height: 100dvh; background: #f6f7f7; color: var(--mat-sys-on-surface);
    }
    .grow { flex: 1; }
    .login { min-height: 100dvh; display: flex; flex-direction: column; padding: 24px 16px; box-sizing: border-box; }
    .logo { font-weight: 700; font-size: 18px; display: flex; align-items: center; gap: 8px; }
    .dot { width: 12px; height: 12px; border-radius: 3px; background: var(--mat-sys-primary); }
    .inner { margin: auto 0; display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 360px; align-self: center; }
    .inner h1 { font-size: 28px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.5px; }
    .row { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
    .link { color: var(--mat-sys-primary); font-size: 14px; cursor: pointer; }
    .foot { text-align: center; font-size: 13px; color: var(--mat-sys-on-surface-variant); }

    .shell { display: grid; grid-template: 'content' 1fr 'bottom' auto / 1fr; min-height: 100dvh; }
    .side { grid-area: side; display: none; flex-direction: column; background: #1c2426; color: #cfd8da; padding: 12px; gap: 2px;
      position: sticky; top: 0; height: 100dvh; box-sizing: border-box; overflow-y: auto; }
    .salon { display: flex; gap: 10px; align-items: center; padding: 8px 8px 16px; color: #fff; }
    .salon small { display: block; color: #93a4a8; font-size: 12px; }
    .avatar { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; background: #0e7490; font-weight: 700; font-size: 13px; }
    .group { text-transform: uppercase; font-size: 11px; letter-spacing: 1px; color: #7c8e92; margin: 16px 8px 4px; }
    .item { display: flex; align-items: center; gap: 12px; padding: 7px 10px; border-radius: 6px; font-size: 14px; cursor: pointer; }
    .item mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .item:hover { background: #ffffff10; }
    .item.on { background: #0e7490; color: #fff; }
    .content { grid-area: content; padding: 16px; min-width: 0; }
    .bar { display: flex; align-items: center; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
    .bar h1 { font-size: 22px; margin: 0; }
    .bar .add { margin-left: 8px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e6e7; border-radius: 8px; font-size: 14px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eef0f1; }
    th { font-size: 12px; color: var(--mat-sys-on-surface-variant); font-weight: 600; background: #fafbfb; }
    td:first-child { font-variant-numeric: tabular-nums; font-weight: 600; }
    .bottom { grid-area: bottom; position: sticky; bottom: 0; display: flex; background: #1c2426; }
    .bottom a { flex: 1; text-align: center; color: #cfd8da; font-size: 13px; padding: 16px 0; }
    .bottom a.on { color: #fff; font-weight: 600; box-shadow: inset 0 3px 0 #22d3ee; }
    @media (max-width: 767.98px) { th:nth-child(3), td:nth-child(3) { display: none; } }
    @media (min-width: 768px) {
      .shell { grid-template: 'side content' 1fr / 248px 1fr; }
      .side { display: flex; }
      .bottom { display: none; }
      .content { padding: 24px 32px; }
    }
  `,
})
export class VariantC {
  readonly screen = input.required<'login' | 'panel'>();
  readonly settings = SETTINGS_NAV;
  readonly visits = VISITS;
  readonly salon = SALON;
  readonly person = PERSON;
}
