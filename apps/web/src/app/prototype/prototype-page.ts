// PROTOTYPE (T10): three visual directions for login + panel layout on /app/prototyp?variant=A&screen=panel.
import { Component, input } from '@angular/core';
import { PrototypeSwitcher } from './prototype-switcher';
import { VariantA } from './variant-a';
import { VariantB } from './variant-b';
import { VariantC } from './variant-c';

@Component({
  selector: 'app-prototype-page',
  imports: [PrototypeSwitcher, VariantA, VariantB, VariantC],
  template: `
    @switch (v()) {
      @case ('A') { <app-variant-a [screen]="s()" /> }
      @case ('B') { <app-variant-b [screen]="s()" /> }
      @case ('C') { <app-variant-c [screen]="s()" /> }
    }
    <app-prototype-switcher [variant]="v()" [screen]="s()" />
  `,
})
export class PrototypePage {
  readonly variant = input<string>();
  readonly screen = input<string>();
  v = () => (['A', 'B', 'C'].includes(this.variant() ?? '') ? this.variant() : 'A') as 'A' | 'B' | 'C';
  s = () => (this.screen() === 'login' ? 'login' : 'panel') as 'login' | 'panel';
}
