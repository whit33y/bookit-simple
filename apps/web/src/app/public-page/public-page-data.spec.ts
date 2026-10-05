import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, convertToParamMap } from '@angular/router';
import { PublicPage } from '@bookit/shared';
import {
  API_ORIGIN,
  PublicPageResult,
  publicPageResolver,
} from './public-page-data';

describe('publicPageResolver', () => {
  function resolve(slug: string): Promise<PublicPageResult> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_ORIGIN, useValue: 'http://api.internal:3000' },
      ],
    });
    const route = {
      paramMap: convertToParamMap({ slug }),
    } as ActivatedRouteSnapshot;
    return runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      publicPageResolver(route, {} as never),
    ) as Promise<PublicPageResult>;
  }
  const http = () => TestBed.inject(HttpTestingController);
  const PAGE_URL = 'http://api.internal:3000/api/public/pages/studio-kora';

  afterEach(() => http().verify());

  it('fetches the Wizytówka from the api', async () => {
    const result = resolve('studio-kora');
    const page = { salon: { name: 'Studio Kora' } } as PublicPage;

    http().expectOne(PAGE_URL).flush(page);

    expect(await result).toBe(page);
  });

  it('is not found for an unknown address', async () => {
    const result = resolve('studio-kora');

    http()
      .expectOne(PAGE_URL)
      .flush(null, { status: 404, statusText: 'Not Found' });

    expect(await result).toBe('not-found');
  });

  it('is unavailable when the api fails', async () => {
    const result = resolve('studio-kora');

    http()
      .expectOne(PAGE_URL)
      .flush(null, { status: 502, statusText: 'Bad Gateway' });

    expect(await result).toBe('unavailable');
  });

  it.each(['ab', 'Studio-Kora', 'panel', 'favicon.ico'])(
    'does not ask the api about %s, which cannot be an Adres wizytówki',
    async (slug) => {
      expect(await resolve(slug)).toBe('not-found');
    },
  );
});
