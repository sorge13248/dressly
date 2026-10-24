import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, NgZone, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { catchError, firstValueFrom, of } from 'rxjs';
import { ConfirmModalComponent } from '../shared/components/confirm-modal/confirm-modal.component';
import { ApiService } from './api.service';
import { AuthUser, OidcConfig } from './models';

interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  userinfo_endpoint?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(Dialog);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  readonly oidcConfig = signal<OidcConfig | null>(null);
  readonly oidcMetadata = signal<OidcMetadata | null>(null);
  readonly profile = signal<AuthUser | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private metadataRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionPingTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionExpiredModalOpen = false;

  sessionPingIntervalMs = 30_000;

  readonly isAuthenticated = computed(() => Boolean(this.profile()));
  readonly displayName = computed(() => this.profile()?.displayName ?? 'Ospite');
  readonly email = computed(() => this.profile()?.email ?? null);
  readonly pictureUrl = computed(() => this.profile()?.pictureUrl ?? null);
  readonly initials = computed(() => {
    const source = this.displayName().trim();
    return source
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'D';
  });
  readonly loginMode = computed(() => (this.oidcMetadata() ? 'OIDC' : 'OIDC non pronto'));

  constructor() {
    effect(() => {
      const authenticated = this.isAuthenticated();
      untracked(() => {
        if (authenticated) {
          this.startSessionPing();
        } else {
          this.stopSessionPing();
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.stopSessionPing();
      this.clearMetadataRetry();
    });

    void this.initialize();
  }

  async initialize() {
    this.loading.set(true);
    try {
      await this.loadOidcConfig();
      await this.loadProfile();

      this.scheduleMetadataRetryIfNeeded();
    } finally {
      this.loading.set(false);
    }
  }

  async waitUntilInitialized(timeoutMs = 5000) {
    if (!this.loading()) {
      return;
    }

    await new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (!this.loading() || Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });
  }

  async loadOidcConfig() {
    this.clearMetadataRetry();
    const config = await firstValueFrom(this.api.getOidcConfig().pipe(catchError(() => of(null))));
    if (!config) {
      this.oidcConfig.set(null);
      this.oidcMetadata.set(null);
      this.error.set('Configurazione OIDC non disponibile dal backend');
      this.scheduleMetadataRetryIfNeeded();
      return;
    }

    this.oidcConfig.set(config);
    this.error.set(null);

    if (!config.issuerUrl || !config.clientId || !config.redirectUri) {
      this.oidcMetadata.set(null);
      this.error.set('Configurazione OIDC incompleta');
      this.scheduleMetadataRetryIfNeeded();
      return;
    }

    const metadata = await firstValueFrom(this.api.getOidcMetadata().pipe(catchError(() => of(null))));
    this.oidcMetadata.set(metadata);

    if (!metadata) {
      this.error.set('Metadata OIDC non disponibili');
      this.scheduleMetadataRetryIfNeeded();
      return;
    }

    this.error.set(null);
  }

  async login() {
    window.location.assign('/api/auth/login');
  }

  async completeCallback(url: string) {
    this.loading.set(true);

    try {
      const currentUrl = new URL(url, window.location.origin);
      if (currentUrl.searchParams.get('error')) {
        throw new Error(currentUrl.searchParams.get('error_description') ?? 'Autenticazione rifiutata dal provider');
      }

      await this.loadProfile();
      if (!this.profile()) {
        throw new Error('Sessione non disponibile dopo il callback OIDC');
      }

      this.startSessionPing();
      return true;
    } finally {
      this.loading.set(false);
    }
  }

  logout() {
    this.stopSessionPing();
    void firstValueFrom(this.http.post('/api/auth/logout', {}).pipe(catchError(() => of(null)))).finally(() => {
      this.profile.set(null);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem('dressly_wardrobe_selected_ids');
        }
      } catch {
        // Ignored
      }
      void this.router.navigateByUrl('/login');
    });
  }

  startSessionPing(): void {
    this.stopSessionPing();

    if (!this.isAuthenticated() || this.sessionExpiredModalOpen) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.sessionPingTimer = setTimeout(async () => {
        this.sessionPingTimer = null;
        await this.checkSession();
        if (this.isAuthenticated() && !this.sessionExpiredModalOpen) {
          this.startSessionPing();
        }
      }, this.sessionPingIntervalMs);
    });
  }

  stopSessionPing(): void {
    if (this.sessionPingTimer) {
      clearTimeout(this.sessionPingTimer);
      this.sessionPingTimer = null;
    }
  }

  async checkSession(): Promise<boolean> {
    if (!this.isAuthenticated() || this.sessionExpiredModalOpen) {
      return false;
    }

    try {
      const profile = await firstValueFrom(this.http.get<AuthUser>('/api/me'));
      if (!this.isAuthenticated() || this.sessionExpiredModalOpen) {
        return false;
      }

      if (profile) {
        this.ngZone.run(() => {
          this.profile.set(profile);
        });
        return true;
      }

      this.handleSessionExpired();
      return false;
    } catch (err: unknown) {
      if (!this.isAuthenticated() || this.sessionExpiredModalOpen) {
        return false;
      }

      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
        this.handleSessionExpired();
        return false;
      }

      return true;
    }
  }

  handleSessionExpired(): void {
    this.stopSessionPing();

    this.ngZone.run(() => {
      this.profile.set(null);

      if (this.sessionExpiredModalOpen) {
        return;
      }
      this.sessionExpiredModalOpen = true;

      const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
        disableClose: true,
        data: {
          title: 'Sessione scaduta',
          message: 'La sessione di autenticazione è scaduta. Ricarica la pagina per rinnovare la sessione e continuare a usare Dressly.',
          confirmLabel: 'Ricarica pagina',
          showCancel: false,
          confirmVariant: 'primary',
        },
      });

      dialogRef.closed.subscribe(() => {
        this.sessionExpiredModalOpen = false;
        this.reloadPage();
      });
    });
  }

  reloadPage(): void {
    if (typeof window !== 'undefined' && window.location) {
      try {
        window.location.reload();
      } catch {
        // Ignored in non-browser or test environments
      }
    }
  }

  private async loadProfile() {
    try {
      const profile = await firstValueFrom(this.http.get<AuthUser>('/api/me').pipe(catchError(() => of(null))));
      if (profile) {
        this.profile.set(profile);
        return;
      }
    } catch {
      // Keep anonymous profile when backend session is missing.
    }

    this.profile.set(null);
  }

  private scheduleMetadataRetryIfNeeded() {
    if (this.oidcMetadata() || this.metadataRetryTimer) {
      return;
    }

    this.metadataRetryTimer = setTimeout(() => {
      this.metadataRetryTimer = null;
      void this.loadOidcConfig();
    }, 2000);
  }

  private clearMetadataRetry() {
    if (!this.metadataRetryTimer) {
      return;
    }

    clearTimeout(this.metadataRetryTimer);
    this.metadataRetryTimer = null;
  }
}