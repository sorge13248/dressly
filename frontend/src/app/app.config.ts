import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  ENVIRONMENT_INITIALIZER,
  inject,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter } from '@angular/router';
import { DEFAULT_DIALOG_CONFIG, DIALOG_SCROLL_STRATEGY, DialogConfig } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';

import { authInterceptor } from './core/auth.interceptor';
import { routes } from './app.routes';
import { ModalScrollLockService } from './core/modal-scroll-lock.service';
import { AppTitleStrategy } from './core/title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: ENVIRONMENT_INITIALIZER,
      useFactory: () => {
        const lockService = inject(ModalScrollLockService);
        return () => lockService.init();
      },
      multi: true,
    },
    {
      provide: DEFAULT_DIALOG_CONFIG,
      useValue: Object.assign(new DialogConfig(), {
        hasBackdrop: true,
        backdropClass: 'cdk-overlay-dark-backdrop',
      }),
    },
    {
      provide: DIALOG_SCROLL_STRATEGY,
      useFactory: (overlay: Overlay) => () => overlay.scrollStrategies.noop(),
      deps: [Overlay],
    },
  ],
};
