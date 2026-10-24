import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { Dialog } from '@angular/cdk/dialog';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useValue: {
            getOidcConfig: () => of(null),
            getOidcMetadata: () => of(null),
          },
        },
        {
          provide: Dialog,
          useValue: {
            open: vi.fn(),
          },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    authService.stopSessionPing();
    // Flush any pending requests from AuthService initialization
    const pending = httpTesting.match(() => true);
    pending.forEach((req) => req.flush(null));
    httpTesting.verify();
  });

  it('should attach withCredentials to /api requests', () => {
    http.get('/api/test').subscribe();
    const req = httpTesting.expectOne('/api/test');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('should call handleSessionExpired when authenticated and API returns 401', () => {
    const expiredSpy = vi.spyOn(authService, 'handleSessionExpired').mockImplementation(() => {});
    authService.profile.set({
      id: '123',
      subject: 'sub-123',
      displayName: 'Test User',
      email: 'test@example.com',
      pictureUrl: null,
    });

    let errorReceived = false;
    http.get('/api/clothes').subscribe({
      error: () => {
        errorReceived = true;
      },
    });

    const req = httpTesting.expectOne('/api/clothes');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(errorReceived).toBe(true);
    expect(expiredSpy).toHaveBeenCalledTimes(1);
  });

  it('should not call handleSessionExpired when unauthenticated', () => {
    const expiredSpy = vi.spyOn(authService, 'handleSessionExpired').mockImplementation(() => {});
    expect(authService.isAuthenticated()).toBe(false);

    let errorReceived = false;
    http.get('/api/clothes').subscribe({
      error: () => {
        errorReceived = true;
      },
    });

    const req = httpTesting.expectOne('/api/clothes');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(errorReceived).toBe(true);
    expect(expiredSpy).not.toHaveBeenCalled();
  });
});

