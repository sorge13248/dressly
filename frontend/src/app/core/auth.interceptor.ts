import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api')) {
    return next(request);
  }

  const authService = inject(AuthService);
  const cloned = request.clone({ withCredentials: true });

  return next(cloned).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        (error.status === 401 || error.status === 403) &&
        authService.isAuthenticated() &&
        !request.url.startsWith('/api/auth/login') &&
        !request.url.startsWith('/api/auth/logout')
      ) {
        authService.handleSessionExpired();
      }
      return throwError(() => error);
    }),
  );
};