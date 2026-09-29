import { Component, input } from '@angular/core';

/** An empty page for a menu item whose screen comes in a later task. */
@Component({
  selector: 'app-placeholder-page',
  template: `
    <h1>{{ heading() }}</h1>
    <p>Ta sekcja jest w przygotowaniu.</p>
  `,
  styles: `
    p {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PlaceholderPage {
  /** From the route's `data`. */
  readonly heading = input.required<string>();
}
