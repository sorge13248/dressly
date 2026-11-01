import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import {
  BaseReferenceItem,
  ClothesItem,
  ClothesSyncInput,
  FieldUpdate,
  LaundrySyncInput,
  OutfitSyncInput,
  ReferenceDataSyncInput,
  ReferenceKind,
  SyncConflict,
  SyncPayloadDto,
  SyncQueueItem,
  SyncResponseDto,
  SyncStatus,
} from './models';
import { OfflineStorageService } from './offline-storage.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(OfflineStorageService);
  private readonly toast = inject(ToastService, { optional: true });

  readonly status = signal<SyncStatus>('online-ok');
  readonly conflicts = signal<SyncConflict[]>([]);
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly pendingCount = signal<number>(0);
  readonly lastSyncTime = signal<Date | null>(null);
  readonly dataUpdated = signal<number>(0);

  private activeSyncPromise: Promise<SyncResponseDto | null> | null = null;
  private initPromise: Promise<void> | null = null;
  private startupToastShown = false;

  readonly isSyncing = computed(() => this.status() === 'syncing');
  readonly isConflict = computed(() => this.status() === 'conflict');
  readonly isOffline = computed(() => !this.isOnline() || this.status() === 'offline');
  readonly isOk = computed(() => this.isOnline() && this.status() === 'online-ok');

  private probeInterval: ReturnType<typeof setInterval> | null = null;
  private syncScheduled = false;

  constructor() {
    this.init();
  }

  notifyDataChanged(): void {
    this.dataUpdated.update((n) => n + 1);
  }

  showStartupToastIfFirst(): void {
    if (!this.startupToastShown) {
      this.startupToastShown = true;
      this.toast?.success('Sincronizzazione completata');
    }
  }

  isOfflineError(err: unknown): boolean {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return true;
    }
    if (err instanceof HttpErrorResponse) {
      return err.status === 0;
    }
    if (err && typeof err === 'object') {
      if ('status' in err && (err as { status: number }).status === 0) {
        return true;
      }
      const msg = String((err as { message?: string }).message || '').toLowerCase();
      if (msg.includes('offline') || msg.includes('network error') || msg.includes('failed to fetch')) {
        return true;
      }
    }
    return false;
  }

  markOffline(): void {
    this.isOnline.set(false);
    this.status.set('offline');
    this.conflicts.set([]);
    this.startHealthProbe();
  }

  markOnline(): void {
    this.isOnline.set(true);
    this.stopHealthProbe();
    void this.sync();
  }

  checkIsOffline(): boolean {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return true;
    }
    return !this.isOnline() || this.status() === 'offline';
  }

  private startHealthProbe(): void {
    if (this.probeInterval || typeof window === 'undefined') return;
    this.probeInterval = setInterval(async () => {
      try {
        const res = await fetch('/health', { method: 'GET', cache: 'no-store' });
        if (res.ok) {
          this.markOnline();
        }
      } catch {
        // Still offline
      }
    }, 5000);
  }

  private stopHealthProbe(): void {
    if (this.probeInterval) {
      clearInterval(this.probeInterval);
      this.probeInterval = null;
    }
  }

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    if (typeof window !== 'undefined') {
      this.isOnline.set(navigator.onLine);
      if (!navigator.onLine) {
        this.status.set('offline');
      }

      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }

    try {
      const meta = await this.storage.getMetadata();
      if (meta.lastSyncAt) {
        this.lastSyncTime.set(new Date(meta.lastSyncAt));
      }
      if (meta.conflicts && meta.conflicts.length > 0) {
        this.conflicts.set(meta.conflicts);
        this.status.set('conflict');
      } else if (!this.isOnline()) {
        this.status.set('offline');
      } else {
        this.status.set(meta.lastSyncStatus === 'conflict' ? 'conflict' : 'online-ok');
      }

      const queue = await this.storage.getQueue();
      this.pendingCount.set(queue.length);

      const localClothes = await this.storage.getAllClothes();
      if (this.isOnline()) {
        try {
          const res = localClothes.length === 0 ? await this.sync(true) : await this.sync();
          if (res) {
            this.showStartupToastIfFirst();
          }
        } catch {
          // Storage init graceful fallback
        }
      }
    } catch {
      // Storage init graceful fallback
    }
  }

  private handleOnline(): void {
    this.isOnline.set(true);
    void this.sync();
  }

  private handleOffline(): void {
    this.isOnline.set(false);
    this.status.set('offline');
  }

  async sync(forceFullSync = false): Promise<SyncResponseDto | null> {
    if (!this.isOnline() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.markOffline();
      return null;
    }

    if (this.activeSyncPromise) {
      this.syncScheduled = true;
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      try {
        return await this.executeSync(forceFullSync);
      } finally {
        this.activeSyncPromise = null;
        if (this.syncScheduled) {
          this.syncScheduled = false;
          void this.sync();
        }
      }
    })();

    return this.activeSyncPromise;
  }

  async downloadServerVersion(): Promise<SyncResponseDto | null> {
    if (!this.isOnline() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.markOffline();
      return null;
    }

    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = this.executeDownloadServerVersion();
    try {
      return await this.activeSyncPromise;
    } finally {
      this.activeSyncPromise = null;
    }
  }

  private async executeDownloadServerVersion(): Promise<SyncResponseDto | null> {
    this.status.set('syncing');

    try {
      await this.storage.clearQueue();
      this.pendingCount.set(0);

      const payload: SyncPayloadDto = {
        lastSyncAt: null,
        clientTime: new Date().toISOString(),
        changes: {
          clothes: [],
          referenceData: [],
          laundry: {
            washing: { added: [], removed: [] },
            ironing: { added: [], removed: [] },
          },
        },
      };

      const response = await firstValueFrom(this.api.sync(payload));

      await this.storage.clearClothes();
      if (response.serverChanges?.clothes?.length) {
        await this.storage.saveClothes(response.serverChanges.clothes);
      }

      if (response.serverChanges?.referenceData) {
        for (const [kind, items] of Object.entries(response.serverChanges.referenceData)) {
          if (items?.length) {
            await this.storage.saveReferenceData(kind as ReferenceKind, items);
          }
        }
      }

      if (response.serverChanges?.laundry) {
        await this.storage.saveLaundry({
          washing: response.serverChanges.laundry.washingClothesIds ?? [],
          ironing: response.serverChanges.laundry.ironingClothesIds ?? [],
        });
      }

      if (this.storage.clearOutfits) {
        await this.storage.clearOutfits();
      }
      if (response.serverChanges?.outfits?.length && this.storage.saveOutfits) {
        await this.storage.saveOutfits(response.serverChanges.outfits);
      }

      this.conflicts.set([]);
      this.status.set('online-ok');
      const serverDate = new Date(response.serverTime);
      this.lastSyncTime.set(serverDate);

      await this.storage.setMetadata({
        lastSyncAt: response.serverTime,
        lastSyncStatus: 'online-ok',
        conflicts: [],
      });

      this.isOnline.set(true);
      this.stopHealthProbe();
      this.notifyDataChanged();
      return response;
    } catch (err) {
      if (this.isOfflineError(err)) {
        this.markOffline();
      } else {
        this.status.set('conflict');
      }
      return null;
    }
  }

  private async executeSync(forceFullSync = false): Promise<SyncResponseDto | null> {
    this.status.set('syncing');

    try {
      const meta = await this.storage.getMetadata();
      const queue = await this.storage.getQueue();
      this.pendingCount.set(queue.length);

      const lastSyncAt = forceFullSync ? null : meta.lastSyncAt;
      const payload = this.buildSyncPayload(lastSyncAt, queue);
      const response = await firstValueFrom(this.api.sync(payload));

      // Remove synced queue items
      if (queue.length > 0) {
        await this.storage.removeQueueItems(queue.map((q) => q.id));
        const updatedQueue = await this.storage.getQueue();
        this.pendingCount.set(updatedQueue.length);
      }

      // Apply server changes to local storage
      if (response.serverChanges) {
        if (response.serverChanges.clothes?.length) {
          await this.storage.saveClothes(response.serverChanges.clothes);
        }
        if (response.serverChanges.deletedClothesIds?.length) {
          await this.storage.removeClothes(response.serverChanges.deletedClothesIds);
        }

        if (response.serverChanges.referenceData) {
          for (const [kind, items] of Object.entries(response.serverChanges.referenceData)) {
            if (items?.length) {
              await this.storage.saveReferenceData(kind as ReferenceKind, items);
            }
          }
        }
        if (response.serverChanges.deletedReferenceData?.length) {
          for (const item of response.serverChanges.deletedReferenceData) {
            await this.storage.removeReferenceData(item.kind as ReferenceKind, [item.id]);
          }
        }

        if (response.serverChanges.laundry) {
          const remainingQueue = await this.storage.getQueue();
          const pendingLaundry = remainingQueue.filter((q) => q.entityType === 'laundry');

          let washing = [...(response.serverChanges.laundry.washingClothesIds ?? [])];
          let ironing = [...(response.serverChanges.laundry.ironingClothesIds ?? [])];

          for (const item of pendingLaundry) {
            if (item.kind === 'washing') {
              if (item.action === 'create') {
                washing = [...new Set([...washing, item.entityId])];
              } else if (item.action === 'delete') {
                washing = washing.filter((id) => id !== item.entityId);
              }
            } else if (item.kind === 'ironing') {
              if (item.action === 'create') {
                ironing = [...new Set([...ironing, item.entityId])];
              } else if (item.action === 'delete') {
                ironing = ironing.filter((id) => id !== item.entityId);
              }
            }
          }

          await this.storage.saveLaundry({
            washing,
            ironing,
          });
        }

        if (response.serverChanges.outfits?.length && this.storage.saveOutfits) {
          await this.storage.saveOutfits(response.serverChanges.outfits);
        }
        if (response.serverChanges.deletedOutfitIds?.length && this.storage.removeOutfits) {
          await this.storage.removeOutfits(response.serverChanges.deletedOutfitIds);
        }

        this.notifyDataChanged();
      }

      // Check conflicts
      const hasConflicts = response.conflicts && response.conflicts.length > 0;
      const hasUnresolved = response.conflicts?.some((c) => c.resolution === 'unresolved') ?? false;

      if (hasConflicts) {
        this.conflicts.set(response.conflicts);
      } else {
        this.conflicts.set([]);
      }

      const nextStatus: SyncStatus = hasUnresolved || response.status === 'conflict' ? 'conflict' : 'online-ok';
      this.status.set(nextStatus);

      const serverDate = new Date(response.serverTime);
      this.lastSyncTime.set(serverDate);

      await this.storage.setMetadata({
        lastSyncAt: response.serverTime,
        lastSyncStatus: nextStatus,
        conflicts: response.conflicts ?? [],
      });

      this.isOnline.set(true);
      this.stopHealthProbe();

      return response;
    } catch (err) {
      if (this.isOfflineError(err)) {
        this.markOffline();
      } else {
        this.status.set('conflict');
      }
      return null;
    }
  }

  private buildSyncPayload(lastSyncAt: string | null, queue: SyncQueueItem[]): SyncPayloadDto {
    const clothesMap = new Map<string, ClothesSyncInput>();
    const refMap = new Map<string, ReferenceDataSyncInput>();
    const outfitMap = new Map<string, OutfitSyncInput>();
    const laundryInput: LaundrySyncInput = {
      washing: { added: [], removed: [] },
      ironing: { added: [], removed: [] },
    };

    for (const item of queue) {
      if (item.entityType === 'clothes') {
        const existing = clothesMap.get(item.entityId) ?? {
          id: item.entityId,
          updatedAt: item.updatedAt,
          deleted: false,
          fields: {},
        };

        if (item.action === 'delete') {
          existing.deleted = true;
          existing.updatedAt = item.updatedAt;
        } else {
          existing.deleted = false;
          existing.updatedAt = item.updatedAt;
          if (item.fields) {
            existing.fields = { ...(existing.fields ?? {}), ...item.fields };
          } else if (item.data) {
            const fieldsObj: Record<string, FieldUpdate> = (existing.fields as Record<string, FieldUpdate>) ?? {};
            for (const [key, val] of Object.entries(item.data)) {
              fieldsObj[key] = { value: val, updatedAt: item.updatedAt };
            }
            existing.fields = fieldsObj;
          }
        }
        clothesMap.set(item.entityId, existing);
      } else if (item.entityType === 'referenceData') {
        const compoundKey = `${item.kind}:${item.entityId}`;
        const existing = refMap.get(compoundKey) ?? {
          kind: item.kind ?? 'brands',
          id: item.entityId,
          updatedAt: item.updatedAt,
          deleted: false,
          fields: {},
        };

        if (item.action === 'delete') {
          existing.deleted = true;
          existing.updatedAt = item.updatedAt;
        } else {
          existing.deleted = false;
          existing.updatedAt = item.updatedAt;
          if (item.fields) {
            existing.fields = { ...(existing.fields ?? {}), ...item.fields };
          } else if (item.data) {
            const fieldsObj: Record<string, FieldUpdate> = (existing.fields as Record<string, FieldUpdate>) ?? {};
            for (const [key, val] of Object.entries(item.data)) {
              fieldsObj[key] = { value: val, updatedAt: item.updatedAt };
            }
            existing.fields = fieldsObj;
          }
        }
        refMap.set(compoundKey, existing);
      } else if (item.entityType === 'laundry' && item.kind) {
        const target = item.kind === 'washing' ? laundryInput.washing! : laundryInput.ironing!;
        if (item.action === 'create') {
          target.added = Array.from(new Set([...(target.added ?? []), item.entityId]));
          target.removed = (target.removed ?? []).filter((id) => id !== item.entityId);
        } else if (item.action === 'delete') {
          target.removed = Array.from(new Set([...(target.removed ?? []), item.entityId]));
          target.added = (target.added ?? []).filter((id) => id !== item.entityId);
        }
      } else if (item.entityType === 'outfits') {
        const existing = outfitMap.get(item.entityId) ?? {
          id: item.entityId,
          updatedAt: item.updatedAt,
          deleted: false,
        };

        if (item.action === 'delete') {
          existing.deleted = true;
          existing.updatedAt = item.updatedAt;
        } else {
          existing.deleted = false;
          existing.updatedAt = item.updatedAt;
          if (item.data) {
            if (item.data['name'] !== undefined) {
              existing.name = String(item.data['name']);
            }
            if (item.data['description'] !== undefined) {
              existing.description = item.data['description'] as string | null;
            }
            if (item.data['canvasLayout'] !== undefined) {
              existing.canvasLayout = item.data['canvasLayout'] as any;
            }
            if (Array.isArray(item.data['clothesIds'])) {
              existing.clothesIds = item.data['clothesIds'] as string[];
            }
            if (Array.isArray(item.data['season_ids'])) {
              existing.season_ids = item.data['season_ids'] as string[];
            }
            if (Array.isArray(item.data['temperature_ids'])) {
              existing.temperature_ids = item.data['temperature_ids'] as string[];
            }
            if (Array.isArray(item.data['use_case_ids'])) {
              existing.use_case_ids = item.data['use_case_ids'] as string[];
            }
          }
          if (item.fields) {
            existing.fields = { ...(existing.fields ?? {}), ...item.fields };
            if (item.fields['name']) {
              existing.name = String((item.fields['name'] as FieldUpdate)?.value ?? item.fields['name']);
            }
            if (item.fields['clothesIds']) {
              existing.clothesIds = (item.fields['clothesIds'] as FieldUpdate)?.value as string[];
            }
          }
        }
        outfitMap.set(item.entityId, existing);
      }
    }

    return {
      lastSyncAt,
      clientTime: new Date().toISOString(),
      changes: {
        clothes: Array.from(clothesMap.values()),
        referenceData: Array.from(refMap.values()),
        laundry: laundryInput,
        outfits: Array.from(outfitMap.values()),
      },
    };
  }

  // Mutation recording methods
  async queueClothesChange(
    clothesId: string,
    action: 'create' | 'update' | 'delete',
    fields?: Record<string, unknown>,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const formattedFields: Record<string, FieldUpdate> = {};
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        formattedFields[k] = { value: v, updatedAt: timestamp };
      }
    }

    const queueItem: SyncQueueItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `queue_${Date.now()}_${Math.random()}`,
      entityType: 'clothes',
      action,
      entityId: clothesId,
      updatedAt: timestamp,
      fields: formattedFields,
      deleted: action === 'delete',
    };

    await this.storage.enqueue(queueItem);
    this.pendingCount.update((count) => count + 1);
    this.notifyDataChanged();

    if (this.isOnline()) {
      void this.sync();
    }
  }

  async queueReferenceChange(
    kind: ReferenceKind,
    id: string,
    action: 'create' | 'update' | 'delete',
    fields?: Record<string, unknown>,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const formattedFields: Record<string, FieldUpdate> = {};
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        formattedFields[k] = { value: v, updatedAt: timestamp };
      }
    }

    const queueItem: SyncQueueItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `queue_${Date.now()}_${Math.random()}`,
      entityType: 'referenceData',
      kind,
      action,
      entityId: id,
      updatedAt: timestamp,
      fields: formattedFields,
      deleted: action === 'delete',
    };

    await this.storage.enqueue(queueItem);
    this.pendingCount.update((count) => count + 1);
    this.notifyDataChanged();

    if (this.isOnline()) {
      void this.sync();
    }
  }

  async queueLaundryChange(
    type: 'washing' | 'ironing',
    clothesId: string,
    action: 'create' | 'delete',
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const queueItem: SyncQueueItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `queue_${Date.now()}_${Math.random()}`,
      entityType: 'laundry',
      kind: type,
      action,
      entityId: clothesId,
      updatedAt: timestamp,
      deleted: action === 'delete',
    };

    await this.storage.enqueue(queueItem);
    this.pendingCount.update((count) => count + 1);
    this.notifyDataChanged();

    if (this.isOnline()) {
      void this.sync();
    }
  }

  async queueLaundryChanges(
    type: 'washing' | 'ironing',
    clothesIds: string[],
    action: 'create' | 'delete',
  ): Promise<void> {
    if (!clothesIds.length) return;

    const timestamp = new Date().toISOString();
    const queueItems: SyncQueueItem[] = clothesIds.map((clothesId) => ({
      id: crypto.randomUUID ? crypto.randomUUID() : `queue_${Date.now()}_${Math.random()}`,
      entityType: 'laundry',
      kind: type,
      action,
      entityId: clothesId,
      updatedAt: timestamp,
      deleted: action === 'delete',
    }));

    if (this.storage.enqueueBatch) {
      await this.storage.enqueueBatch(queueItems);
    } else {
      for (const item of queueItems) {
        await this.storage.enqueue(item);
      }
    }
    this.pendingCount.update((count) => count + queueItems.length);
    this.notifyDataChanged();

    if (this.isOnline()) {
      void this.sync();
    }
  }

  async queueOutfitChange(
    outfitId: string,
    action: 'create' | 'update' | 'delete',
    data?: { name?: string; clothesIds?: string[]; [key: string]: unknown },
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const formattedFields: Record<string, FieldUpdate> = {};
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        formattedFields[k] = { value: v, updatedAt: timestamp };
      }
    }

    const queueItem: SyncQueueItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `queue_${Date.now()}_${Math.random()}`,
      entityType: 'outfits',
      action,
      entityId: outfitId,
      updatedAt: timestamp,
      data,
      fields: formattedFields,
      deleted: action === 'delete',
    };

    await this.storage.enqueue(queueItem);
    this.pendingCount.update((count) => count + 1);
    this.notifyDataChanged();

    if (this.isOnline()) {
      void this.sync();
    }
  }
}

