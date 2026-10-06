import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

/** The centred card that the login, invitation and password reset pages sit in. */
@Component({
  selector: 'app-auth-card',
  imports: [MatCardModule, MatIconModule],
  template: `
    <main class="page">
      <mat-card appearance="outlined" class="card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="logo" aria-hidden="true"
            >spa</mat-icon
          >
          <mat-card-title
            ><h1>{{ heading() }}</h1></mat-card-title
          >
          @if (subheading()) {
            <mat-card-subtitle>{{ subheading() }}</mat-card-subtitle>
          }
        </mat-card-header>
        <mat-card-content>
          <ng-content />
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styles: `
    .page {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 16px;
      box-sizing: border-box;
      background: var(--mat-sys-surface-container);
    }
    .card {
      width: min(420px, 100%);
      padding: 8px;
    }
    h1 {
      font: inherit;
      margin: 0;
    }
    .logo {
      color: var(--mat-sys-primary);
      font-size: 40px;
      width: 40px;
      height: 40px;
    }
    mat-card-content {
      padding-top: 16px;
    }
  `,
})
export class AuthCard {
  readonly heading = input.required<string>();
  readonly subheading = input<string>();
}
