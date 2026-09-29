// PROTOTYPE (T10): floating variant switcher. Not for production.
import { Component, HostListener, inject, input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-prototype-switcher',
  template: `
    <div class="bar">
      <button (click)="step(-1)" aria-label="Poprzedni">‹</button>
      <span>{{ variant() }} · {{ names[variant()] }}</span>
      <button (click)="step(1)" aria-label="Następny">›</button>
      <span class="sep"></span>
      <button [class.on]="screen() === 'login'" (click)="go(variant(), 'login')">Logowanie</button>
      <button [class.on]="screen() === 'panel'" (click)="go(variant(), 'panel')">Panel</button>
    </div>
  `,
  styles: `
    .bar { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 9999;
      display: flex; gap: 6px; align-items: center; background: #111; color: #fff;
      padding: 6px 10px; border-radius: 999px; font: 13px/1 system-ui; box-shadow: 0 6px 24px #0006; white-space: nowrap; }
    button { background: #333; color: #fff; border: 0; border-radius: 999px; padding: 6px 10px; cursor: pointer; font: inherit; }
    button.on { background: #fff; color: #111; }
    .sep { width: 1px; height: 18px; background: #555; }
  `,
})
export class PrototypeSwitcher {
  readonly variant = input.required<'A' | 'B' | 'C'>();
  readonly screen = input.required<'login' | 'panel'>();
  readonly names = { A: 'Klasyczny Material', B: 'Butik', C: 'Recepcja' };
  private readonly router = inject(Router);
  private readonly keys = ['A', 'B', 'C'] as const;

  step(delta: number) {
    const i = this.keys.indexOf(this.variant());
    this.go(this.keys[(i + delta + 3) % 3], this.screen());
  }

  go(variant: string, screen: string) {
    this.router.navigate([], { queryParams: { variant, screen }, replaceUrl: true });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable]')) return;
    if (event.key === 'ArrowLeft') this.step(-1);
    if (event.key === 'ArrowRight') this.step(1);
  }
}
