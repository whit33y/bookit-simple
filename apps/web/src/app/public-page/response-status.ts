import { inject, RESPONSE_INIT } from '@angular/core';

/** The HTTP status of the server-rendered page; nothing in the browser. */
export function setResponseStatus(status: number): void {
  const response = inject(RESPONSE_INIT, { optional: true });
  if (response) response.status = status;
}
