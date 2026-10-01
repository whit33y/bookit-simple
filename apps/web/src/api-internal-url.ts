/**
 * The api as the SSR server reaches it, e.g. `http://api:3000` in the internal network;
 * the browser goes through `/api`. Server code only.
 */
export const apiInternalUrl = (): string =>
  process.env['API_INTERNAL_URL'] || 'http://localhost:3000';
