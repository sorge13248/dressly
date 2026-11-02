import { TestBed } from '@angular/core/testing';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Subject, of } from 'rxjs';
import { PwaUpdateService } from './pwa-update.service';
import { UpdateModalComponent } from '../shared/components/update-modal';

class TestablePwaUpdateService extends PwaUpdateService {
  reloadCalled = false;
  override reloadWindow() {
    this.reloadCalled = true;
  }
}

describe('PwaUpdateService', () => {
  let service: TestablePwaUpdateService;
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDialog = {
      open: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PwaUpdateService, useClass: TestablePwaUpdateService },
        { provide: Dialog, useValue: mockDialog },
      ],
    });

    service = TestBed.inject(PwaUpdateService) as TestablePwaUpdateService;
  });

  it('should be created and have updateAvailable signal as false initially', () => {
    expect(service).toBeTruthy();
    expect(service.updateAvailable()).toBe(false);
  });

  it('should not throw on init when serviceWorker is not supported in environment', () => {
    expect(() => service.init()).not.toThrow();
  });

  it('should open UpdateModalComponent on promptUpdate', () => {
    mockDialog.open.mockReturnValue({
      closed: of(false),
    } as unknown as DialogRef<boolean>);

    service.promptUpdate();

    expect(mockDialog.open).toHaveBeenCalledWith(UpdateModalComponent, {
      disableClose: false,
      hasBackdrop: true,
    });
  });

  it('should not open a second dialog if already open', () => {
    const closed$ = new Subject<boolean>();
    mockDialog.open.mockReturnValue({
      closed: closed$,
    } as unknown as DialogRef<boolean>);

    service.promptUpdate();
    service.promptUpdate();

    expect(mockDialog.open).toHaveBeenCalledTimes(1);

    closed$.next(false);
    closed$.complete();
  });

  it('should trigger applyUpdate and reload when dialog is confirmed', () => {
    mockDialog.open.mockReturnValue({
      closed: of(true),
    } as unknown as DialogRef<boolean>);

    const mockWorker = {
      postMessage: vi.fn(),
    } as unknown as ServiceWorker;

    service.onUpdateReady(mockWorker);

    expect(service.updateAvailable()).toBe(true);
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('should keep updateAvailable true when dialog is dismissed with Più tardi', () => {
    mockDialog.open.mockReturnValue({
      closed: of(false),
    } as unknown as DialogRef<boolean>);

    const mockWorker = {
      postMessage: vi.fn(),
    } as unknown as ServiceWorker;

    service.onUpdateReady(mockWorker);

    expect(service.updateAvailable()).toBe(true);
    expect(service.reloadCalled).toBe(false);
  });

  it('should clean up service workers and caches in dev mode on init', async () => {
    const unregisterMock = vi.fn().mockResolvedValue(true);
    const mockRegistration = { unregister: unregisterMock } as unknown as ServiceWorkerRegistration;
    const getRegistrationsMock = vi.fn().mockResolvedValue([mockRegistration]);

    const deleteCacheMock = vi.fn().mockResolvedValue(true);
    const keysCacheMock = vi.fn().mockResolvedValue(['old-cache']);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: getRegistrationsMock },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(window, 'caches', {
      value: { keys: keysCacheMock, delete: deleteCacheMock },
      configurable: true,
      writable: true,
    });

    service.init();

    await Promise.resolve();
    await Promise.resolve();

    expect(getRegistrationsMock).toHaveBeenCalled();
    expect(unregisterMock).toHaveBeenCalled();
    expect(keysCacheMock).toHaveBeenCalled();
    expect(deleteCacheMock).toHaveBeenCalledWith('old-cache');
  });
});
