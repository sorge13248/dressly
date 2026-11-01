import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth.service';
import { ButtonComponent } from '../../../../shared/components/button';

@Component({
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './callback.component.html',
  styleUrl: './callback.component.scss',
})
export class CallbackPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly status = signal<'loading' | 'done' | 'error'>('loading');
  readonly errorMessage = signal<string | null>(null);
  readonly statusLabel = computed(() => {
    if (this.status() === 'done') {
      return 'Autenticazione completata';
    }
    if (this.status() === 'error') {
      return 'Autenticazione non completata';
    }

    return 'Completo il login...';
  });

  async ngOnInit() {
    try {
      await this.authService.completeCallback(window.location.href);
      this.status.set('done');
      const returnUrl = this.authService.consumeReturnUrl() || '/wardrobe';
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      this.status.set('error');
      this.errorMessage.set(error instanceof Error ? error.message : 'Errore sconosciuto');
    }
  }

  retry() {
    void this.router.navigateByUrl('/login');
  }
}