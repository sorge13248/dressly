import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, NgZone, computed, effect, inject, signal, untracked } from '@angular/core';
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

interface MinimalCachedUser {
  displayName: string;
  pictureUrl?: string | null;
}

const AUTH_STORAGE_KEY = 'dressly_auth_user';
const RETURN_URL_STORAGE_KEY = 'dressly_auth_return_url';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  readonly oidcConfig = signal<OidcConfig | null>(null);
  readonly oidcMetadata = signal<OidcMetadata | null>(null);
  readonly profile = signal<AuthUser | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private metadataRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionPingTimer: ReturnType<typeof setTimeout> | null = null;
  private isRenewingSession = false;
  private silentRefreshPromise: Promise<boolean> | null = null;
  private lastRefreshedAt = Date.now();

  sessionPingIntervalMs = 30_000;
  proactiveRefreshIntervalMs = 4 * 60_000;

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
    const cached = this.getCachedProfile();
    if (cached) {
      this.profile.set(cached);
      this.loading.set(false);
    }

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

    // Proactive refresh check on tab visibility change or window focus
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const onVisibilityOrFocus = () => {
        if (document.visibilityState === 'visible' && this.isAuthenticated()) {
          const elapsed = Date.now() - this.lastRefreshedAt;
          if (elapsed >= this.proactiveRefreshIntervalMs) {
            void this.silentRefresh();
          }
        }
      };

      document.addEventListener('visibilitychange', onVisibilityOrFocus);
      window.addEventListener('focus', onVisibilityOrFocus);

      this.destroyRef.onDestroy(() => {
        document.removeEventListener('visibilitychange', onVisibilityOrFocus);
        window.removeEventListener('focus', onVisibilityOrFocus);
      });
    }

    void this.initialize();
  }

  async initialize() {
    if (!this.profile()) {
      this.loading.set(true);
    }
    try {
      await this.loadProfile();
      this.scheduleMetadataRetryIfNeeded();
    } finally {
      this.loading.set(false);
    }

    void this.loadOidcConfig();
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
    this.setCachedProfile(null);
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

    if (!this.isAuthenticated() || this.isRenewingSession) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.sessionPingTimer = setTimeout(async () => {
        this.sessionPingTimer = null;
        await this.checkSession();
        if (this.isAuthenticated() && !this.isRenewingSession) {
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
    if (!this.isAuthenticated() || this.isRenewingSession) {
      return false;
    }

    // Rinnovo proattivo continuo: se l'intervallo è trascorso, rinnova prima che il token scada!
    const elapsed = Date.now() - this.lastRefreshedAt;
    if (elapsed >= this.proactiveRefreshIntervalMs) {
      const refreshed = await this.silentRefresh();
      if (refreshed) {
        return true;
      }
    }

    try {
      const profile = await firstValueFrom(this.http.get<AuthUser>('/api/me'));
      if (!this.isAuthenticated() || this.isRenewingSession) {
        return false;
      }

      if (profile) {
        this.ngZone.run(() => {
          this.profile.set(profile);
          this.setCachedProfile(profile);
        });
        return true;
      }

      this.handleSessionExpired();
      return false;
    } catch (err: unknown) {
      if (!this.isAuthenticated() || this.isRenewingSession) {
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
    this.setCachedProfile(null);
    this.profile.set(null);

    void this.renewSession();
  }

  async renewSession(): Promise<boolean> {
    if (this.isRenewingSession) {
      return false;
    }
    this.isRenewingSession = true;
    this.stopSessionPing();

    try {
      // 1. Prova prima il refresh silenzioso con token endpoint (/api/auth/refresh)
      const refreshed = await this.silentRefresh();
      if (refreshed && this.isAuthenticated()) {
        this.startSessionPing();
        return true;
      }

      // 2. Se il refresh token non è presente o è scaduto, rinnova immediatamente la sessione via OIDC SSO
      this.setCachedProfile(null);
      this.profile.set(null);
      this.rememberCurrentUrl();
      await this.login();
      return true;
    } catch {
      this.setCachedProfile(null);
      this.profile.set(null);
      void this.router.navigateByUrl('/login');
      return false;
    } finally {
      this.isRenewingSession = false;
    }
  }

  silentRefresh(): Promise<boolean> {
    if (this.silentRefreshPromise) {
      return this.silentRefreshPromise;
    }

    this.silentRefreshPromise = this.doSilentRefresh().finally(() => {
      this.silentRefreshPromise = null;
    });

    return this.silentRefreshPromise;
  }

  private async doSilentRefresh(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ refreshed: boolean; expiresIn?: number }>('/api/auth/refresh', {}).pipe(
          catchError(() => of(null)),
        ),
      );

      if (res?.refreshed) {
        this.lastRefreshedAt = Date.now();
        if (res.expiresIn && res.expiresIn > 60) {
          this.proactiveRefreshIntervalMs = Math.max(60_000, (res.expiresIn - 60) * 1000);
        }
        await this.loadProfileSilently();
        return true;
      }
    } catch {
      // Refresh failed
    }
    return false;
  }

  private async loadProfileSilently(): Promise<boolean> {
    try {
      const profile = await firstValueFrom(
        this.http.get<AuthUser>('/api/me').pipe(catchError(() => of(null))),
      );
      if (profile) {
        this.ngZone.run(() => {
          this.profile.set(profile);
          this.setCachedProfile(profile);
        });
        return true;
      }
    } catch {
      // Ignored
    }
    return false;
  }

  rememberCurrentUrl(): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const path = window.location.pathname + window.location.search;
        if (path && path !== '/login' && !path.startsWith('/auth/callback')) {
          window.sessionStorage.setItem(RETURN_URL_STORAGE_KEY, path);
        }
      }
    } catch {
      // Ignored
    }
  }

  consumeReturnUrl(): string | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const url = window.sessionStorage.getItem(RETURN_URL_STORAGE_KEY);
        window.sessionStorage.removeItem(RETURN_URL_STORAGE_KEY);
        return url;
      }
    } catch {
      // Ignored
    }
    return null;
  }

  private async loadProfile() {
    const hadCachedProfile = Boolean(this.profile());
    try {
      const profile = await firstValueFrom(
        this.http.get<AuthUser>('/api/me').pipe(
          catchError((err: unknown) => {
            if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
              return of(null);
            }
            return of(this.profile());
          }),
        ),
      );

      if (profile) {
        this.profile.set(profile);
        this.setCachedProfile(profile);
        return;
      }
    } catch {
      // Keep anonymous profile when backend session is missing.
    }

    this.profile.set(null);
    this.setCachedProfile(null);

    if (hadCachedProfile) {
      this.handleSessionExpired();
    }
  }

  private getCachedProfile(): AuthUser | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<MinimalCachedUser>;
          if (parsed && typeof parsed.displayName === 'string' && parsed.displayName.trim()) {
            return {
              id: '',
              subject: '',
              displayName: parsed.displayName,
              email: null, // Mail non salvata in localStorage, viene caricata da /me all'avvio
              pictureUrl: typeof parsed.pictureUrl === 'string' ? parsed.pictureUrl : null,
            };
          }
        }
      }
    } catch {
      // Ignored
    }
    return null;
  }

  private setCachedProfile(profile: AuthUser | null): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (profile?.displayName) {
          // La mail NON va salvata in localStorage: solo displayName e pictureUrl
          const minimal: MinimalCachedUser = {
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl ?? null,
          };
          window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(minimal));
        } else {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    } catch {
      // Ignored
    }
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