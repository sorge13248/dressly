import { Component, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth.service';
import { AeroSpinnerComponent } from '../../../../shared/components/spinner/spinner.component';

@Component({
  standalone: true,
  imports: [AeroSpinnerComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly providerReady = computed(() => Boolean(this.authService.oidcMetadata()));
  readonly statusText = computed(() => (this.providerReady() ? 'Reindirizzamento al provider sicuro...' : 'Connessione sicura in corso...'));

  constructor() {
    effect(() => {
      if (this.authService.loading()) {
        return;
      }

      if (this.authService.isAuthenticated()) {
        void this.router.navigateByUrl('/wardrobe');
        return;
      }

      if (this.providerReady()) {
        void this.authService.login();
      }
    });
  }
}