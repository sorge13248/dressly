import { TestBed } from '@angular/core/testing';
import { DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { BackupRestoreModalComponent } from './backup-restore-modal.component';
import { ApiService } from '../../../core/api.service';
import { ToastService } from '../../../core/toast.service';
import { OfflineStorageService } from '../../../core/offline-storage.service';
import { ReferenceStoreService } from '../../../core/reference-store.service';
import { BackupStatsDto, RestoreResultDto } from '../../../core/models';

describe('BackupRestoreModalComponent', () => {
  let dialogRefSpy: { close: ReturnType<typeof vi.fn> };
  let apiMock: {
    getBackupStats: ReturnType<typeof vi.fn>;
    downloadBackupZip: ReturnType<typeof vi.fn>;
    restoreBackupZip: ReturnType<typeof vi.fn>;
  };
  let toastMock: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let referenceStoreMock: { loadAll: ReturnType<typeof vi.fn> };
  let storageMock: { clearAllStores: ReturnType<typeof vi.fn> };

  const mockStats: BackupStatsDto = {
    clothesCount: 15,
    outfitsCount: 4,
    referenceDataCount: 30,
    attachmentsCount: 12,
    totalFileSizeBytes: 1048576, // 1 MB
  };

  beforeEach(() => {
    dialogRefSpy = { close: vi.fn() };
    apiMock = {
      getBackupStats: vi.fn().mockReturnValue(of(mockStats)),
      downloadBackupZip: vi.fn().mockReturnValue(of(new Blob(['dummy-zip'], { type: 'application/zip' }))),
      restoreBackupZip: vi.fn().mockReturnValue(
        of({
          success: true,
          mode: 'replace',
          stats: { clothesCount: 15, outfitsCount: 4, referenceDataCount: 30, filesCount: 12 },
        } as RestoreResultDto),
      ),
    };
    toastMock = { success: vi.fn(), error: vi.fn() };
    referenceStoreMock = { loadAll: vi.fn().mockResolvedValue(undefined) };
    storageMock = { clearAllStores: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      imports: [BackupRestoreModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: ApiService, useValue: apiMock },
        { provide: ToastService, useValue: toastMock },
        { provide: ReferenceStoreService, useValue: referenceStoreMock },
        { provide: OfflineStorageService, useValue: storageMock },
      ],
    });
  });

  it('should create and load stats on init', async () => {
    const fixture = TestBed.createComponent(BackupRestoreModalComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance).toBeTruthy();
    expect(apiMock.getBackupStats).toHaveBeenCalled();
    expect(fixture.componentInstance.stats()?.clothesCount).toBe(15);
  });

  it('should switch tabs between export and restore', () => {
    const fixture = TestBed.createComponent(BackupRestoreModalComponent);
    const comp = fixture.componentInstance;
    expect(comp.activeTab()).toBe('export');

    comp.setTab('restore');
    expect(comp.activeTab()).toBe('restore');

    comp.setTab('export');
    expect(comp.activeTab()).toBe('export');
  });

  it('should handle file selection and enable restore when confirmed', () => {
    const fixture = TestBed.createComponent(BackupRestoreModalComponent);
    const comp = fixture.componentInstance;

    expect(comp.canRestore()).toBe(false);

    const dummyFile = new File(['dummy content'], 'backup.zip', { type: 'application/zip' });
    comp.selectedFile.set(dummyFile);

    // In replace mode, require confirm checkbox
    expect(comp.restoreMode()).toBe('replace');
    expect(comp.canRestore()).toBe(false);

    comp.confirmReplace.set(true);
    expect(comp.canRestore()).toBe(true);

    // In merge mode, confirm checkbox not required
    comp.restoreMode.set('merge');
    expect(comp.canRestore()).toBe(true);
  });

  it('should execute restore and reset offline stores upon success', async () => {
    const fixture = TestBed.createComponent(BackupRestoreModalComponent);
    const comp = fixture.componentInstance;

    const dummyFile = new File(['dummy content'], 'backup.zip', { type: 'application/zip' });
    comp.selectedFile.set(dummyFile);
    comp.restoreMode.set('merge');

    await comp.startRestore();

    expect(apiMock.restoreBackupZip).toHaveBeenCalledWith(dummyFile, 'merge');
    expect(storageMock.clearAllStores).toHaveBeenCalled();
    expect(referenceStoreMock.loadAll).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();
    expect(comp.restoreResult()?.success).toBe(true);
  });

  it('should close dialog when calling close()', () => {
    const fixture = TestBed.createComponent(BackupRestoreModalComponent);
    const comp = fixture.componentInstance;

    comp.close(false);
    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);
  });
});
