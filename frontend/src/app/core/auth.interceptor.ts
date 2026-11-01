import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api')) {
    return next(request);
  }

  const injector = inject(Injector);
  const cloned = request.clone({ withCredentials: true });

  return next(cloned).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        (error.status === 401 || error.status === 403) &&
        !request.url.startsWith('/api/auth/login') &&
        !request.url.startsWith('/api/auth/logout') &&
        !request.url.startsWith('/api/auth/refresh')
      ) {
        const authService = injector.get(AuthService);
        if (authService.isAuthenticated()) {
          return from(authService.silentRefresh()).pipe(
            switchMap((refreshed) => {
              if (refreshed) {
                return next(cloned);
              }
              authService.handleSessionExpired();
              return throwError(() => error);
            }),
          );
        }
      }
      return throwError(() => error);
    }),
  );
};