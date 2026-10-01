import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  mergeApplicationConfig,
  REQUEST,
} from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { apiInternalUrl } from '../api-internal-url';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { API_ORIGIN } from './public-page/public-page-data';

const apiOrigin = new URL(apiInternalUrl()).origin;

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // The Wizytówka reads the api directly, and hands the answers to the browser
    // under the page's own origin, which the browser asks.
    { provide: API_ORIGIN, useValue: apiOrigin },
    {
      provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP,
      useFactory: () => {
        const request = inject(REQUEST, { optional: true });
        return request ? { [apiOrigin]: new URL(request.url).origin } : {};
      },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
