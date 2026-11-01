import { TestBed } from '@angular/core/testing';
import { SyncService } from './sync.service';
import { ApiService } from './api.service';
import { OfflineStorageService } from './offline-storage.service';
import { ToastService } from './toast.service';
import { of, throwError } from 'rxjs';
import { SyncResponseDto } from './models';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SyncService', () => {
  let service: SyncService;
  let mockApi: {
    sync: ReturnType<typeof vi.fn>;
  };
  let mockToast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let mockStorage: {
    getMetadata: ReturnType<typeof vi.fn>;
    setMetadata: ReturnType<typeof vi.fn>;
    getQueue: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
    removeQueueItems: ReturnType<typeof vi.fn>;
    saveClothes: ReturnType<typeof vi.fn>;
    removeClothes: ReturnType<typeof vi.fn>;
    getAllClothes: ReturnType<typeof vi.fn>;
    saveReferenceData: ReturnType<typeof vi.fn>;
    removeReferenceData: ReturnType<typeof vi.fn>;
    saveLaundry: ReturnType<typeof vi.fn>;
  };

  const dummyResponse: SyncResponseDto = {
    serverTime: '2026-11-01T17:00:00.000Z',
    status: 'ok',
    conflicts: [],
    applied: {
      clothes: ['c1'],
      referenceData: ['r1'],
      laundry: true,
    },
    serverChanges: {
      clothes: [],
      deletedClothesIds: [],
      referenceData: {},
      deletedReferenceData: [],
      laundry: {
        washingClothesIds: [],
        ironingClothesIds: [],
      },
    },
  };

  beforeEach(() => {
    mockApi = {
      sync: vi.fn().mockReturnValue(of(dummyResponse)),
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    mockStorage = {
      getMetadata: vi.fn().mockResolvedValue({
        lastSyncAt: null,
        lastSyncStatus: 'online-ok',
        conflicts: [],
      }),
      setMetadata: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn().mockResolvedValue(undefined),
      removeQueueItems: vi.fn().mockResolvedValue(undefined),
      saveClothes: vi.fn().mockResolvedValue(undefined),
      removeClothes: vi.fn().mockResolvedValue(undefined),
      getAllClothes: vi.fn().mockResolvedValue([]),
      saveReferenceData: vi.fn().mockResolvedValue(undefined),
      removeReferenceData: vi.fn().mockResolvedValue(undefined),
      saveLaundry: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        SyncService,
        { provide: ApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: OfflineStorageService, useValue: mockStorage },
      ],
    });

    service = TestBed.inject(SyncService);
  });

  it('should initialize and set status to online-ok when online and no conflicts', async () => {
    await service.init();
    expect(service.status()).toBe('online-ok');
    expect(service.isOk()).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith('Sincronizzazione completata');
  });

  it('should transition to syncing during sync execution and back to online-ok on success', async () => {
    mockStorage.getQueue.mockResolvedValue([
      {
        id: 'q1',
        entityType: 'clothes',
        action: 'update',
        entityId: 'c1',
        updatedAt: '2026-11-01T16:30:00.000Z',
        fields: { notes: { value: 'New note', updatedAt: '2026-11-01T16:30:00.000Z' } },
      },
    ]);

    const result = await service.sync();

    expect(mockApi.sync).toHaveBeenCalled();
    expect(result?.status).toBe('ok');
    expect(service.status()).toBe('online-ok');
    expect(mockStorage.removeQueueItems).toHaveBeenCalledWith(['q1']);
  });

  it('should set status to conflict when response contains unresolved conflicts', async () => {
    const conflictResponse: SyncResponseDto = {
      ...dummyResponse,
      status: 'conflict',
      conflicts: [
        {
          entityType: 'clothes',
          entityId: 'c1',
          field: 'notes',
          clientValue: 'A',
          serverValue: 'B',
          clientTimestamp: '2026-11-01T16:00:00.000Z',
          serverTimestamp: '2026-11-01T16:00:00.000Z',
          resolution: 'unresolved',
          message: 'Conflict',
        },
      ],
    };
    mockApi.sync.mockReturnValue(of(conflictResponse));

    await service.sync();

    expect(service.status()).toBe('conflict');
    expect(service.isConflict()).toBe(true);
    expect(service.conflicts().length).toBe(1);
  });

  it('should set status to offline when sync fails due to network', async () => {
    mockApi.sync.mockReturnValue(throwError(() => new Error('Network error')));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    await service.sync();

    expect(service.status()).toBe('offline');
    expect(service.isOffline()).toBe(true);
  });

  it('should queue local clothes change with field-level timestamps', async () => {
    await service.queueClothesChange('c-100', 'update', { notes: 'offline note', size: 'L' });

    expect(mockStorage.enqueue).toHaveBeenCalled();
    const queued = mockStorage.enqueue.mock.calls[0][0];
    expect(queued.entityType).toBe('clothes');
    expect(queued.entityId).toBe('c-100');
    expect(queued.fields?.notes?.value).toBe('offline note');
    expect(queued.fields?.size?.value).toBe('L');
    expect(queued.fields?.notes?.updatedAt).toBeTruthy();
  });
});

