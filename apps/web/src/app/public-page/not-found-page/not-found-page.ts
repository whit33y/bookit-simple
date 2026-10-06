import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { setResponseStatus } from '../response-status';

/** An address with no Wizytówka and no other page; the server answers `404`. */
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Nie ma takiej strony</h1>
      <p>Sprawdź, czy adres jest wpisany poprawnie.</p>
    </main>
  `,
  styleUrl: '../status-page.scss',
})
export class NotFoundPage {
  constructor() {
    setResponseStatus(404);
    inject(Title).setTitle('Nie ma takiej strony · Bookit');
  }
}
