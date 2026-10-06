import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { setResponseStatus } from '../response-status';

/** The api did not answer; the server answers `503`, so Google comes back later. */
@Component({
  selector: 'app-page-unavailable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Strona chwilowo niedostępna</h1>
      <p>Spróbuj ponownie za kilka minut.</p>
    </main>
  `,
  styleUrl: '../status-page.scss',
})
export class PageUnavailable {
  constructor() {
    setResponseStatus(503);
    inject(Title).setTitle('Strona chwilowo niedostępna · Bookit');
  }
}
