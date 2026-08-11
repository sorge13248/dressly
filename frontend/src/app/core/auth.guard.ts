import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const evaluate = () => (authService.isAuthenticated() ? true : router.parseUrl('/login'));

  if (!authService.loading()) {
    return evaluate();
  }

  return authService.waitUntilInitialized().then(() => evaluate());
};