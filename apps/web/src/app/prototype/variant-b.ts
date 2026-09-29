// PROTOTYPE (T10) variant B "Butik": split-screen login with brand panel, navigation rail with
// "+ Wizyta" FAB, no top bar; on phones a bottom bar with a raised centre "+".
import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MAIN_NAV, PERSON, SALON, VISITS } from './prototype-data';

@Component({
  selector: 'app-variant-b',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="theme-b">
      @if (screen() === 'login') {
        <main class="split">
          <section class="brand">
            <div class="mark">bookit</div>
            <p class="claim">Kalendarz Salonu,<br />który zastępuje zeszyt<br />na recepcji.</p>
          </section>
          <section class="form">
            <h1>Witaj ponownie</h1>
            <p class="muted">Zaloguj się, żeby zobaczyć dzisiejsze Wizyty.</p>
            <mat-form-field appearance="fill">
              <mat-label>E-mail</mat-label>
              <input matInput type="email" value="anna@studiokora.pl" />
            </mat-form-field>
            <mat-form-field appearance="fill">
              <mat-label>Hasło</mat-label>
              <input matInput type="password" value="xxxxxxxxxx" />
            </mat-form-field>
            <button mat-flat-button class="wide">Zaloguj się</button>
            <a mat-button class="wide">Nie pamiętasz hasła?</a>
          </section>
        </main>
      } @else {
        <div class="shell">
          <nav class="rail">
            <div class="mark small">b</div>
            <button mat-fab aria-label="Nowa Wizyta"><mat-icon>add</mat-icon></button>
            @for (item of nav; track item.label; let first = $first) {
              <a class="rail-item" [class.on]="first">
                <span class="pill"><mat-icon>{{ item.icon }}</mat-icon></span>
                <span class="lbl">{{ item.label }}</span>
              </a>
            }
            <span class="grow"></span>
            <a class="rail-item"><span class="pill"><mat-icon>logout</mat-icon></span><span class="lbl">Wyloguj</span></a>
          </nav>
          <main class="content">
            <header class="head">
              <div>
                <p class="eyebrow">{{ salon }}</p>
                <h1>Dzień dobry, {{ firstName }}</h1>
              </div>
              <span class="date">wt, 29 września</span>
            </header>
            <ol class="timeline">
              @for (v of visits; track v.time) {
                <li>
                  <span class="t">{{ v.time }}</span>
                  <div class="visit">
                    <strong>{{ v.client }}</strong>
                    <span>{{ v.service }} · {{ v.staff }}</span>
                  </div>
                </li>
              }
            </ol>
          </main>
          <nav class="bottom">
            <a class="tab on"><mat-icon>calendar_month</mat-icon><span>Kalendarz</span></a>
            <a class="tab"><mat-icon>group</mat-icon><span>Klienci</span></a>
            <button class="plus" aria-label="Nowa Wizyta"><mat-icon>add</mat-icon></button>
            <a class="tab"><mat-icon>settings</mat-icon><span>Ustawienia</span></a>
            <a class="tab"><mat-icon>person</mat-icon><span>Konto</span></a>
          </nav>
        </div>
      }
    </div>
  `,
  styles: `
    @use '@angular/material' as mat;
    .theme-b {
      @include mat.theme((color: (primary: mat.$rose-palette, tertiary: mat.$orange-palette)));
      --serif: 'Fraunces', Georgia, serif;
      background: #fbf7f5; min-height: 100dvh; color: var(--mat-sys-on-surface);
    }
    .grow { flex: 1; }
    .muted { color: var(--mat-sys-on-surface-variant); }
    .mark { font-family: var(--serif); font-size: 40px; font-weight: 600; letter-spacing: -1px; }
    .mark.small { font-size: 28px; color: var(--mat-sys-primary); margin-bottom: 8px; }
    .wide { width: 100%; }

    .split { min-height: 100dvh; display: grid; grid-template-rows: auto 1fr; }
    .brand { padding: 32px 24px; color: #fff; background: linear-gradient(150deg, #9d174d, #e11d48 55%, #fb923c); }
    .claim { font-family: var(--serif); font-size: 22px; line-height: 1.3; margin: 16px 0 0; }
    .form { padding: 32px 24px; display: flex; flex-direction: column; gap: 4px; max-width: 420px; width: 100%; box-sizing: border-box; justify-self: center; }
    .form h1 { font-family: var(--serif); font-size: 32px; margin: 0; }
    .form .muted { margin: 4px 0 20px; }
    @media (min-width: 768px) {
      .split { grid-template: 1fr / 1fr 1fr; }
      .brand { display: flex; flex-direction: column; justify-content: space-between; padding: 48px; }
      .claim { font-size: 40px; }
      .form { align-self: center; }
    }

    .shell { display: grid; grid-template: 'content' 1fr 'bottom' auto / 1fr; min-height: 100dvh; }
    .rail { grid-area: rail; display: none; flex-direction: column; align-items: center; gap: 12px; padding: 20px 0; }
    .rail-item { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }
    .pill { width: 56px; height: 32px; border-radius: 16px; display: grid; place-items: center; }
    .rail-item.on .pill { background: var(--mat-sys-secondary-container); }
    .rail-item.on { font-weight: 600; }
    .content { grid-area: content; padding: 20px 16px; }
    .head { display: flex; justify-content: space-between; align-items: end; gap: 12px; margin-bottom: 20px; }
    .head h1 { font-family: var(--serif); font-size: 28px; margin: 0; }
    .eyebrow { text-transform: uppercase; letter-spacing: 1.5px; font-size: 12px; color: var(--mat-sys-primary); margin: 0 0 4px; font-weight: 600; }
    .date { color: var(--mat-sys-on-surface-variant); font-size: 14px; }
    .timeline { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .timeline li { display: grid; grid-template-columns: 56px 1fr; gap: 12px; align-items: stretch; }
    .t { font-variant-numeric: tabular-nums; font-weight: 600; padding-top: 12px; }
    .visit { background: #fff; border-radius: 16px; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px;
      border-left: 4px solid var(--mat-sys-primary); box-shadow: 0 1px 2px #0001; }
    .visit span { color: var(--mat-sys-on-surface-variant); font-size: 14px; }

    .bottom { grid-area: bottom; position: sticky; bottom: 0; display: flex; align-items: center; background: #fff;
      box-shadow: 0 -2px 12px #0000000f; padding: 6px 4px 10px; }
    .tab { flex: 1; display: flex; flex-direction: column; align-items: center; font-size: 11px; gap: 2px; color: var(--mat-sys-on-surface-variant); }
    .tab.on { color: var(--mat-sys-primary); font-weight: 600; }
    .plus { width: 56px; height: 56px; border-radius: 50%; border: 0; margin-top: -28px; color: #fff; cursor: pointer;
      background: var(--mat-sys-primary); box-shadow: 0 6px 16px #e11d4866; display: grid; place-items: center; }
    @media (min-width: 768px) {
      .shell { grid-template: 'rail content' 1fr / 96px 1fr; }
      .rail { display: flex; position: sticky; top: 0; height: 100dvh; box-sizing: border-box; }
      .bottom { display: none; }
      .content { padding: 32px 40px; max-width: 960px; }
      .head h1 { font-size: 36px; }
    }
  `,
})
export class VariantB {
  readonly screen = input.required<'login' | 'panel'>();
  readonly nav = MAIN_NAV;
  readonly visits = VISITS;
  readonly salon = SALON;
  readonly firstName = PERSON.split(' ')[0];
}
