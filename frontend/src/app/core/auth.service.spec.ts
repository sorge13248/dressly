import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { AuthUser } from './models';

describe('AuthService Session Ping and Expiration', () => {
  let service: AuthService;
  let httpGetSpy: ReturnType<typeof vi.fn>;
  let httpPostSpy: ReturnType<typeof vi.fn>;

  const store = new Map<string, string>();
  const storageMock: Storage = {
    length: 0,
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };

  beforeAll(() => {
    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();

    httpGetSpy = vi.fn().mockReturnValue(of(null));
    httpPostSpy = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        return of({ refreshed: true });
      }
      return of({ loggedOut: true });
    });

    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', children: [] }]),
        AuthService,
        {
          provide: HttpClient,
          useValue: {
            get: httpGetSpy,
            post: httpPostSpy,
          },
        },
        {
          provide: ApiService,
          useValue: {
            getOidcConfig: () => of(null),
            getOidcMetadata: () => of(null),
          },
        },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    service.stopSessionPing();
  });

  it('should not ping if not authenticated', async () => {
    expect(service.isAuthenticated()).toBe(false);
    const result = await service.checkSession();
    expect(result).toBe(false);
  });

  it('should ping /api/me and update profile if authenticated', async () => {
    const mockUser: AuthUser = {
      id: 'user-1',
      subject: 'sub-1',
      displayName: 'Mario Rossi',
      email: 'mario@example.com',
      pictureUrl: null,
    };
    service.profile.set(mockUser);
    expect(service.isAuthenticated()).toBe(true);

    const updatedUser: AuthUser = {
      ...mockUser,
      displayName: 'Mario Rossi Updated',
    };
    httpGetSpy.mockReturnValue(of(updatedUser));

    const success = await service.checkSession();
    expect(success).toBe(true);
    expect(httpGetSpy).toHaveBeenCalledWith('/api/me');
    expect(service.displayName()).toBe('Mario Rossi Updated');
  });

  it('should handle session expiration on 401 response and renew session immediately without modal', async () => {
    const mockUser: AuthUser = {
      id: 'user-1',
      subject: 'sub-1',
      displayName: 'Mario Rossi',
      email: 'mario@example.com',
      pictureUrl: null,
    };
    service.profile.set(mockUser);
    expect(service.isAuthenticated()).toBe(true);

    const renewSpy = vi.spyOn(service, 'renewSession').mockResolvedValue(true);

    httpGetSpy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
    );

    const success = await service.checkSession();
    expect(success).toBe(false);
    expect(service.isAuthenticated()).toBe(false);
    expect(renewSpy).toHaveBeenCalledTimes(1);
  });

  it('should renew session silently via /api/auth/refresh when refresh token succeeds', async () => {
    const refreshedUser: AuthUser = {
      id: 'user-refreshed',
      subject: 'sub-refreshed',
      displayName: 'Refreshed User',
      email: 'refreshed@example.com',
      pictureUrl: null,
    };

    httpPostSpy.mockReturnValue(of({ refreshed: true }));
    httpGetSpy.mockReturnValue(of(refreshedUser));

    const renewed = await service.renewSession();
    expect(renewed).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.displayName()).toBe('Refreshed User');
    expect(localStorage.getItem('dressly_auth_user')).toContain('Refreshed User');
  });

  it('should redirect to login to renew session when silent refresh fails', async () => {
    httpPostSpy.mockReturnValue(of(null));
    const loginSpy = vi.spyOn(service, 'login').mockResolvedValue();

    const renewed = await service.renewSession();
    expect(renewed).toBe(true);
    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should proactively trigger silent refresh during checkSession when interval has elapsed', async () => {
    const mockUser: AuthUser = {
      id: 'user-1',
      subject: 'sub-1',
      displayName: 'Mario Rossi',
      email: 'mario@example.com',
      pictureUrl: null,
    };
    service.profile.set(mockUser);
    expect(service.isAuthenticated()).toBe(true);

    const silentSpy = vi.spyOn(service, 'silentRefresh').mockResolvedValue(true);
    service.proactiveRefreshIntervalMs = 0; // force proactive refresh to be due immediately

    const res = await service.checkSession();
    expect(res).toBe(true);
    expect(silentSpy).toHaveBeenCalledTimes(1);
  });

  it('should start and stop timer on session ping', () => {
    vi.useFakeTimers();
    try {
      service.profile.set({
        id: 'user-1',
        subject: 'sub-1',
        displayName: 'Mario Rossi',
        email: 'mario@example.com',
        pictureUrl: null,
      });

      const checkSpy = vi.spyOn(service, 'checkSession').mockResolvedValue(true);
      service.sessionPingIntervalMs = 5000;
      service.startSessionPing();

      vi.advanceTimersByTime(5000);
      expect(checkSpy).toHaveBeenCalledTimes(1);

      service.stopSessionPing();
      vi.advanceTimersByTime(10000);
      expect(checkSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should restore minimal cached profile from localStorage without email and set loading to false immediately', async () => {
    localStorage.setItem('dressly_auth_user', JSON.stringify({ displayName: 'Cached User', pictureUrl: null }));

    const fullProfile: AuthUser = {
      id: 'user-cached',
      subject: 'sub-cached',
      displayName: 'Cached User',
      email: 'live-from-api@example.com',
      pictureUrl: null,
    };
    httpGetSpy.mockReturnValue(of(fullProfile));

    const freshInstance = TestBed.runInInjectionContext(() => new AuthService());
    expect(freshInstance.displayName()).toBe('Cached User');
    expect(freshInstance.email()).toBeNull(); // Mail is not stored in localStorage initially
    expect(freshInstance.pictureUrl()).toBeNull();
    expect(freshInstance.isAuthenticated()).toBe(true);
    expect(freshInstance.loading()).toBe(false);

    await freshInstance.initialize();
    expect(httpGetSpy).toHaveBeenCalledWith('/api/me');
    expect(freshInstance.email()).toBe('live-from-api@example.com');
  });

  it('should only persist minimal UI profile data (displayName and pictureUrl) and omit email, ids and tokens in localStorage', () => {
    const fullUser: AuthUser = {
      id: 'internal-id-999',
      subject: 'oidc-sub-888',
      displayName: 'Mario Rossi',
      email: 'mario@example.com',
      pictureUrl: 'https://example.com/avatar.png',
    };

    (service as unknown as { setCachedProfile: (u: AuthUser) => void }).setCachedProfile(fullUser);

    const raw = localStorage.getItem('dressly_auth_user');
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw!);
    expect(stored).toEqual({
      displayName: 'Mario Rossi',
      pictureUrl: 'https://example.com/avatar.png',
    });
    expect(stored.email).toBeUndefined(); // Email is strictly NOT in localStorage
    expect(stored.id).toBeUndefined();
    expect(stored.subject).toBeUndefined();
  });

  it('should clear cached profile from localStorage on logout', async () => {
    const mockUser: AuthUser = {
      id: 'user-1',
      subject: 'sub-1',
      displayName: 'Mario Rossi',
      email: 'mario@example.com',
      pictureUrl: null,
    };
    localStorage.setItem('dressly_auth_user', JSON.stringify(mockUser));
    service.profile.set(mockUser);

    service.logout();
    expect(localStorage.getItem('dressly_auth_user')).toBeNull();
  });

  it('should clear cached profile from localStorage on session expired', () => {
    const mockUser: AuthUser = {
      id: 'user-1',
      subject: 'sub-1',
      displayName: 'Mario Rossi',
      email: 'mario@example.com',
      pictureUrl: null,
    };
    localStorage.setItem('dressly_auth_user', JSON.stringify(mockUser));
    service.profile.set(mockUser);

    service.handleSessionExpired();
    expect(localStorage.getItem('dressly_auth_user')).toBeNull();
  });
});

