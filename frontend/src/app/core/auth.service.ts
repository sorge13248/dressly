import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, of } from 'rxjs';
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

  readonly oidcConfig = signal<OidcConfig | null>(null);
  readonly oidcMetadata = signal<OidcMetadata | null>(null);
  readonly profile = signal<AuthUser | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private metadataRetryTimer: ReturnType<typeof setTimeout> | null = null;

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
      if (!this.isAuthenticated()) {
        this.profile.set(null);
      }
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

      return true;
    } finally {
      this.loading.set(false);
    }
  }

  logout() {
    void firstValueFrom(this.http.post('/api/auth/logout', {}).pipe(catchError(() => of(null)))).finally(() => {
      this.profile.set(null);
      void this.router.navigateByUrl('/login');
    });
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