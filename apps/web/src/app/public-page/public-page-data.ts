import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { pageHeaderLayout, PublicPage, validateSlug } from '@bookit/shared';
import { firstValueFrom } from 'rxjs';

/**
 * Where the Wizytówka asks for its data: the page's own origin in the browser (`/api`
 * goes through the proxy), `API_INTERNAL_URL` on the server (app.config.server.ts).
 * Absolute on both sides, so the server's answer reaches the browser in the transfer
 * cache under the same key and is not fetched again.
 */
export const API_ORIGIN = new InjectionToken<string>('API_ORIGIN', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).location.origin,
});

/** The Wizytówka, or why there is none: an unknown address, or the api failed. */
export type PublicPageResult = PublicPage | 'not-found' | 'unavailable';

/** `/:slug`: the Wizytówka under that Adres wizytówki. Old addresses never get here (server.ts). */
export const publicPageResolver: ResolveFn<PublicPageResult> = async (
  route,
) => {
  const slug = route.paramMap.get('slug') ?? '';
  if (validateSlug(slug)) return 'not-found';
  const http = inject(HttpClient);
  const origin = inject(API_ORIGIN);
  try {
    const page = await firstValueFrom(
      http.get<PublicPage>(`${origin}/api/public/pages/${slug}`),
    );
    return {
      ...page,
      salon: {
        ...page.salon,
        headerLayout: pageHeaderLayout(page.salon.headerLayout),
      },
    };
  } catch (error) {
    if (error instanceof HttpErrorResponse && error.status === 404) {
      return 'not-found';
    }
    return 'unavailable';
  }
};
