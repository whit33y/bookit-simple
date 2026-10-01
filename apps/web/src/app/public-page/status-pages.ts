import {
  ChangeDetectionStrategy,
  Component,
  inject,
  RESPONSE_INIT,
} from '@angular/core';
import { Title } from '@angular/platform-browser';

/** The HTTP status of the server-rendered page; nothing in the browser. */
function setResponseStatus(status: number): void {
  const response = inject(RESPONSE_INIT, { optional: true });
  if (response) response.status = status;
}

const styles = `
  :host {
    display: grid;
    place-content: center;
    min-height: 100vh;
    padding: 24px 16px;
    box-sizing: border-box;
    text-align: center;
    background: #fff;
    color: #1d1b20;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 1.5rem;
  }
  p {
    margin: 0;
    color: #49454f;
  }
`;

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
  styles,
})
export class NotFoundPage {
  constructor() {
    setResponseStatus(404);
    inject(Title).setTitle('Nie ma takiej strony · Bookit');
  }
}

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
  styles,
})
export class PageUnavailable {
  constructor() {
    setResponseStatus(503);
    inject(Title).setTitle('Strona chwilowo niedostępna · Bookit');
  }
}
