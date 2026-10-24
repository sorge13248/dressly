import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { of, throwError, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { ConfirmModalComponent } from '../shared/components/confirm-modal/confirm-modal.component';
import { AuthUser } from './models';

describe('AuthService Session Ping and Expiration', () => {
  let service: AuthService;
  let dialogOpenSpy: ReturnType<typeof vi.fn>;
  let closedSubject: Subject<boolean>;
  let httpGetSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    closedSubject = new Subject<boolean>();
    dialogOpenSpy = vi.fn().mockReturnValue({
      closed: closedSubject.asObservable(),
      close: vi.fn(),
    } as unknown as DialogRef<boolean>);

    httpGetSpy = vi.fn().mockReturnValue(of(null));

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {
          provide: HttpClient,
          useValue: {
            get: httpGetSpy,
            post: vi.fn().mockReturnValue(of({ loggedOut: true })),
          },
        },
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
            open: dialogOpenSpy,
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
    expect(dialogOpenSpy).not.toHaveBeenCalled();
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
    expect(dialogOpenSpy).not.toHaveBeenCalled();
  });

  it('should handle session expiration on 401 response and open modal', async () => {
    const mockUser: AuthUser = {
      id: 'user-1',
      subject: 'sub-1',
      displayName: 'Mario Rossi',
      email: 'mario@example.com',
      pictureUrl: null,
    };
    service.profile.set(mockUser);
    expect(service.isAuthenticated()).toBe(true);

    const reloadSpy = vi.spyOn(service, 'reloadPage').mockImplementation(() => {});

    httpGetSpy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
    );

    const success = await service.checkSession();
    expect(success).toBe(false);
    expect(service.isAuthenticated()).toBe(false);

    expect(dialogOpenSpy).toHaveBeenCalledTimes(1);
    expect(dialogOpenSpy).toHaveBeenCalledWith(ConfirmModalComponent, {
      disableClose: true,
      data: expect.objectContaining({
        title: 'Sessione scaduta',
        confirmLabel: 'Ricarica pagina',
        showCancel: false,
        confirmVariant: 'primary',
      }),
    });

    // Simulating user clicking reload / modal close
    closedSubject.next(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('should not open modal again if already open', () => {
    service.profile.set({
      id: 'user-1',
      subject: 'sub-1',
      displayName: 'Mario Rossi',
      email: 'mario@example.com',
      pictureUrl: null,
    });

    service.handleSessionExpired();
    expect(dialogOpenSpy).toHaveBeenCalledTimes(1);

    service.handleSessionExpired();
    expect(dialogOpenSpy).toHaveBeenCalledTimes(1);
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
});

