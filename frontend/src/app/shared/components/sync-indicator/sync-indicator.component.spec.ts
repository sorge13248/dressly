import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SyncIndicatorComponent } from './sync-indicator.component';
import { SyncService } from '../../../core/sync.service';
import { ToastService } from '../../../core/toast.service';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { SyncConflict, SyncStatus } from '../../../core/models';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SyncIndicatorComponent', () => {
  let component: SyncIndicatorComponent;
  let fixture: ComponentFixture<SyncIndicatorComponent>;

  const mockStatus = signal<SyncStatus>('online-ok');
  const mockPendingCount = signal<number>(0);
  const mockConflicts = signal<SyncConflict[]>([]);
  const mockIsOnline = signal<boolean>(true);
  const mockLastSyncTime = signal<Date | null>(new Date('2026-11-01T15:30:00Z'));
  const mockSync = vi.fn().mockResolvedValue(null);
  const mockDownloadServerVersion = vi.fn().mockResolvedValue(null);

  const mockSyncService = {
    status: mockStatus,
    pendingCount: mockPendingCount,
    conflicts: mockConflicts,
    isOnline: mockIsOnline,
    lastSyncTime: mockLastSyncTime,
    sync: mockSync,
    downloadServerVersion: mockDownloadServerVersion,
  };

  const mockDialog = {
    open: vi.fn().mockReturnValue({ closed: of(true) } as unknown as DialogRef<boolean>),
  };

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };

  beforeEach(async () => {
    mockStatus.set('online-ok');
    mockPendingCount.set(0);
    mockConflicts.set([]);
    mockIsOnline.set(true);
    mockLastSyncTime.set(new Date('2026-11-01T15:30:00Z'));
    mockSync.mockClear();
    mockDownloadServerVersion.mockClear();
    mockDialog.open.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();

    await TestBed.configureTestingModule({
      imports: [SyncIndicatorComponent],
      providers: [
        { provide: SyncService, useValue: mockSyncService },
        { provide: Dialog, useValue: mockDialog },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SyncIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render green circular arrows when status is online-ok', () => {
    mockStatus.set('online-ok');
    fixture.detectChanges();

    const okIcon = fixture.nativeElement.querySelector('.icon-ok');
    expect(okIcon).toBeTruthy();
    expect(component.tooltip()).toContain('Sincronizzazione in linea: OK');
  });

  it('should render spinner when status is syncing', () => {
    mockStatus.set('syncing');
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('.icon-spinner');
    expect(spinner).toBeTruthy();
    expect(component.tooltip()).toContain('Sincronizzazione in corso...');
  });

  it('should render gray slashed cloud when status is offline', () => {
    mockStatus.set('offline');
    fixture.detectChanges();

    const offlineIcon = fixture.nativeElement.querySelector('.icon-offline');
    expect(offlineIcon).toBeTruthy();
    expect(component.tooltip()).toContain('Connessione assente (offline)');
  });

  it('should render red error icon when status is conflict', () => {
    mockStatus.set('conflict');
    fixture.detectChanges();

    const conflictIcon = fixture.nativeElement.querySelector('.icon-conflict');
    expect(conflictIcon).toBeTruthy();
    expect(component.tooltip()).toContain('Conflitto di sincronizzazione!');
  });

  it('should toggle dropdown when clicking sync pill', () => {
    expect(component.dropdownOpen()).toBe(false);
    const button = fixture.nativeElement.querySelector('.sync-pill');

    button.click();
    fixture.detectChanges();
    expect(component.dropdownOpen()).toBe(true);

    const dropdown = fixture.nativeElement.querySelector('.sync-dropdown');
    expect(dropdown).toBeTruthy();
    expect(dropdown.textContent).toContain('Ultima sincronizzazione');

    button.click();
    fixture.detectChanges();
    expect(component.dropdownOpen()).toBe(false);
  });

  it('should show formatted last sync date and "Mai" if not available', () => {
    expect(component.formattedLastSync()).not.toBe('Mai');

    mockLastSyncTime.set(null);
    expect(component.formattedLastSync()).toBe('Mai');
  });

  it('should call sync when clicking "Sincronizza ora"', async () => {
    component.dropdownOpen.set(true);
    fixture.detectChanges();

    const syncNowBtn = fixture.nativeElement.querySelector('.sync-now-btn');
    expect(syncNowBtn).toBeTruthy();

    await component.onSyncNow();
    expect(mockSync).toHaveBeenCalled();
    expect(component.dropdownOpen()).toBe(false);
  });

  it('should open confirmation modal and call downloadServerVersion on confirm', async () => {
    component.dropdownOpen.set(true);
    fixture.detectChanges();

    const downloadBtn = fixture.nativeElement.querySelector('.download-server-btn');
    expect(downloadBtn).toBeTruthy();

    await component.onDownloadServerVersion();
    expect(mockDialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          confirmVariant: 'danger',
        }),
      }),
    );
    expect(mockDownloadServerVersion).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Versione del server scaricata con successo');
  });

  it('should not call downloadServerVersion if modal is cancelled', async () => {
    mockDialog.open.mockReturnValueOnce({ closed: of(false) } as unknown as DialogRef<boolean>);
    component.dropdownOpen.set(true);
    fixture.detectChanges();

    const downloadBtn = fixture.nativeElement.querySelector('.download-server-btn');
    expect(downloadBtn).toBeTruthy();

    await component.onDownloadServerVersion();

    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockDownloadServerVersion).not.toHaveBeenCalled();
  });

  it('should close dropdown when pressing Escape key', () => {
    component.dropdownOpen.set(true);
    fixture.detectChanges();

    component.onEscape();
    expect(component.dropdownOpen()).toBe(false);
  });
});

