import { Injectable } from '@angular/core';
import { isValidTagCode, normalizeTagCode } from '../shared/utils/tag-code.utils';
import {
  BaseReferenceItem,
  ClothesFilters,
  ClothesItem,
  IroningClothesItem,
  ReferenceKind,
  SyncConflict,
  SyncQueueItem,
  SyncStatus,
  WashingClothesItem,
  OutfitItem,
} from './models';

const DB_NAME = 'dressly_offline_v1';
const DB_VERSION = 2;

const STORE_CLOTHES = 'clothes';
const STORE_REFERENCE = 'reference_data';
const STORE_LAUNDRY = 'laundry';
const STORE_OUTFITS = 'outfits';
const STORE_QUEUE = 'sync_queue';
const STORE_META = 'meta';

export interface StorageMetadata {
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatus;
  conflicts: SyncConflict[];
}

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly memoryStore = {
    clothes: new Map<string, ClothesItem>(),
    referenceData: new Map<string, BaseReferenceItem>(), // key: `${kind}:${id}`
    laundry: { washing: [] as string[], ironing: [] as string[] },
    outfits: new Map<string, OutfitItem>(),
    queue: [] as SyncQueueItem[],
    meta: {
      lastSyncAt: null as string | null,
      lastSyncStatus: 'online-ok' as SyncStatus,
      conflicts: [] as SyncConflict[],
    },
  };

  private getDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_CLOTHES)) {
              db.createObjectStore(STORE_CLOTHES, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_REFERENCE)) {
              const store = db.createObjectStore(STORE_REFERENCE, { keyPath: 'compoundKey' });
              store.createIndex('kind', 'kind', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_LAUNDRY)) {
              db.createObjectStore(STORE_LAUNDRY, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORE_OUTFITS)) {
              db.createObjectStore(STORE_OUTFITS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_QUEUE)) {
              db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
              db.createObjectStore(STORE_META, { keyPath: 'key' });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  // Clothes methods
  async getAllClothes(): Promise<ClothesItem[]> {
    const db = await this.getDB();
    if (!db) {
      return Array.from(this.memoryStore.clothes.values());
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CLOTHES, 'readonly');
        const req = tx.objectStore(STORE_CLOTHES).getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => resolve(Array.from(this.memoryStore.clothes.values()));
      } catch {
        resolve(Array.from(this.memoryStore.clothes.values()));
      }
    });
  }

  async getClothes(id: string): Promise<ClothesItem | null> {
    const db = await this.getDB();
    if (!db) {
      return this.memoryStore.clothes.get(id) ?? null;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CLOTHES, 'readonly');
        const req = tx.objectStore(STORE_CLOTHES).get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(this.memoryStore.clothes.get(id) ?? null);
      } catch {
        resolve(this.memoryStore.clothes.get(id) ?? null);
      }
    });
  }

  async isTagCodeAvailable(code: string, excludeId?: string | null): Promise<boolean> {
    const normalized = normalizeTagCode(code);
    if (!normalized || !isValidTagCode(normalized)) {
      return false;
    }
    const all = await this.getAllClothes();
    const collision = all.find(
      (item) => item.code && item.code.trim().toUpperCase() === normalized && item.id !== excludeId,
    );
    return !collision;
  }

  async saveClothes(items: ClothesItem[]): Promise<void> {
    for (const item of items) {
      this.memoryStore.clothes.set(item.id, item);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CLOTHES, 'readwrite');
        const store = tx.objectStore(STORE_CLOTHES);
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async removeClothes(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.memoryStore.clothes.delete(id);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CLOTHES, 'readwrite');
        const store = tx.objectStore(STORE_CLOTHES);
        for (const id of ids) {
          store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async clearClothes(): Promise<void> {
    this.memoryStore.clothes.clear();
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CLOTHES, 'readwrite');
        tx.objectStore(STORE_CLOTHES).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // Reference Data methods
  async getReferenceData(kind: ReferenceKind): Promise<BaseReferenceItem[]> {
    const db = await this.getDB();
    if (!db) {
      const result: BaseReferenceItem[] = [];
      for (const [key, val] of this.memoryStore.referenceData.entries()) {
        if (key.startsWith(`${kind}:`)) {
          result.push(val);
        }
      }
      return result;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_REFERENCE, 'readonly');
        const store = tx.objectStore(STORE_REFERENCE);
        const index = store.index('kind');
        const req = index.getAll(kind);
        req.onsuccess = () => {
          const items = (req.result ?? []).map((row: { data: BaseReferenceItem }) => row.data);
          resolve(items);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async getAllReferenceData(): Promise<Record<string, BaseReferenceItem[]>> {
    const kinds: ReferenceKind[] = [
      'colors',
      'brands',
      'seasons',
      'temperatures',
      'use-cases',
      'fits',
      'materials',
      'types',
      'tags',
    ];
    const result: Record<string, BaseReferenceItem[]> = {};
    for (const kind of kinds) {
      result[kind] = await this.getReferenceData(kind);
    }
    return result;
  }

  async saveReferenceData(kind: ReferenceKind, items: BaseReferenceItem[]): Promise<void> {
    for (const item of items) {
      this.memoryStore.referenceData.set(`${kind}:${item.id}`, item);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_REFERENCE, 'readwrite');
        const store = tx.objectStore(STORE_REFERENCE);
        for (const item of items) {
          store.put({
            compoundKey: `${kind}:${item.id}`,
            kind,
            id: item.id,
            data: item,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async removeReferenceData(kind: ReferenceKind, ids: string[]): Promise<void> {
    for (const id of ids) {
      this.memoryStore.referenceData.delete(`${kind}:${id}`);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_REFERENCE, 'readwrite');
        const store = tx.objectStore(STORE_REFERENCE);
        for (const id of ids) {
          store.delete(`${kind}:${id}`);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // Laundry methods
  async getLaundry(): Promise<{ washing: string[]; ironing: string[] }> {
    const db = await this.getDB();
    if (!db) {
      return { ...this.memoryStore.laundry };
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_LAUNDRY, 'readonly');
        const store = tx.objectStore(STORE_LAUNDRY);
        const reqW = store.get('washing');
        const reqI = store.get('ironing');
        tx.oncomplete = () => {
          resolve({
            washing: reqW.result?.ids ?? this.memoryStore.laundry.washing,
            ironing: reqI.result?.ids ?? this.memoryStore.laundry.ironing,
          });
        };
        tx.onerror = () => resolve({ ...this.memoryStore.laundry });
      } catch {
        resolve({ ...this.memoryStore.laundry });
      }
    });
  }

  async saveLaundry(data: { washing?: string[]; ironing?: string[] }): Promise<void> {
    if (data.washing !== undefined) this.memoryStore.laundry.washing = data.washing;
    if (data.ironing !== undefined) this.memoryStore.laundry.ironing = data.ironing;

    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_LAUNDRY, 'readwrite');
        const store = tx.objectStore(STORE_LAUNDRY);
        if (data.washing !== undefined) {
          store.put({ key: 'washing', ids: data.washing });
        }
        if (data.ironing !== undefined) {
          store.put({ key: 'ironing', ids: data.ironing });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async addToWashing(clothesIds: string[]): Promise<void> {
    const current = await this.getLaundry();
    const updated = [...current.washing, ...clothesIds];
    await this.saveLaundry({ washing: updated });
  }

  async removeFromWashing(clothesId: string, quantityToRemove = 1, removeAll = false): Promise<void> {
    const current = await this.getLaundry();
    let updated: string[];
    if (removeAll) {
      updated = current.washing.filter((id) => id !== clothesId);
    } else {
      updated = [...current.washing];
      for (let i = 0; i < quantityToRemove; i++) {
        const idx = updated.indexOf(clothesId);
        if (idx !== -1) {
          updated.splice(idx, 1);
        }
      }
    }
    await this.saveLaundry({ washing: updated });
  }

  async clearWashing(): Promise<void> {
    await this.saveLaundry({ washing: [] });
  }

  async addToIroning(clothesIds: string[]): Promise<void> {
    const current = await this.getLaundry();
    const updated = [...current.ironing, ...clothesIds];
    await this.saveLaundry({ ironing: updated });
  }

  async removeFromIroning(clothesId: string, quantityToRemove = 1, removeAll = false): Promise<void> {
    const current = await this.getLaundry();
    let updated: string[];
    if (removeAll) {
      updated = current.ironing.filter((id) => id !== clothesId);
    } else {
      updated = [...current.ironing];
      for (let i = 0; i < quantityToRemove; i++) {
        const idx = updated.indexOf(clothesId);
        if (idx !== -1) {
          updated.splice(idx, 1);
        }
      }
    }
    await this.saveLaundry({ ironing: updated });
  }

  async clearIroning(): Promise<void> {
    await this.saveLaundry({ ironing: [] });
  }

  async moveWashingToIroning(clothesId: string, quantityToMove = 1, moveAll = false): Promise<void> {
    const current = await this.getLaundry();
    let updatedWashing = [...current.washing];
    const toMoveCount = moveAll
      ? updatedWashing.filter((id) => id === clothesId).length
      : quantityToMove;

    for (let i = 0; i < toMoveCount; i++) {
      const idx = updatedWashing.indexOf(clothesId);
      if (idx !== -1) {
        updatedWashing.splice(idx, 1);
      }
    }
    const updatedIroning = [...current.ironing];
    for (let i = 0; i < toMoveCount; i++) {
      updatedIroning.push(clothesId);
    }
    await this.saveLaundry({ washing: updatedWashing, ironing: updatedIroning });
  }

  async getClothesForWashing(): Promise<WashingClothesItem[]> {
    const all = await this.getAllClothes();
    const laundry = await this.getLaundry();
    const washingIds = laundry.washing;
    const washingCountMap = new Map<string, number>();
    for (const id of washingIds) {
      washingCountMap.set(id, (washingCountMap.get(id) ?? 0) + 1);
    }
    const washingSet = new Set(washingIds);
    return all
      .filter((item) => washingSet.has(item.id))
      .map((item) => ({
        ...item,
        washingQuantity: washingCountMap.get(item.id) ?? 1,
        primaryAttachment: item.attachments?.[0]
          ? {
              id: item.attachments[0].id,
              fileName: item.attachments[0].fileName,
              previewPath: item.attachments[0].previewPath ?? null,
              mimeType: item.attachments[0].mimeType ?? '',
            }
          : null,
      })) as unknown as WashingClothesItem[];
  }

  async getClothesForIroning(): Promise<IroningClothesItem[]> {
    const all = await this.getAllClothes();
    const laundry = await this.getLaundry();
    const ironingIds = laundry.ironing;
    const ironingCountMap = new Map<string, number>();
    for (const id of ironingIds) {
      ironingCountMap.set(id, (ironingCountMap.get(id) ?? 0) + 1);
    }
    const ironingSet = new Set(ironingIds);
    return all
      .filter((item) => ironingSet.has(item.id))
      .map((item) => ({
        ...item,
        ironingQuantity: ironingCountMap.get(item.id) ?? 1,
        primaryAttachment: item.attachments?.[0]
          ? {
              id: item.attachments[0].id,
              fileName: item.attachments[0].fileName,
              previewPath: item.attachments[0].previewPath ?? null,
              mimeType: item.attachments[0].mimeType ?? '',
            }
          : null,
      })) as unknown as IroningClothesItem[];
  }

  // Outfits methods
  async getAllOutfits(): Promise<OutfitItem[]> {
    const db = await this.getDB();
    if (!db) {
      return Array.from(this.memoryStore.outfits.values());
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_OUTFITS, 'readonly');
        const req = tx.objectStore(STORE_OUTFITS).getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => resolve(Array.from(this.memoryStore.outfits.values()));
      } catch {
        resolve(Array.from(this.memoryStore.outfits.values()));
      }
    });
  }

  async getOutfit(id: string): Promise<OutfitItem | null> {
    const db = await this.getDB();
    if (!db) {
      return this.memoryStore.outfits.get(id) ?? null;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_OUTFITS, 'readonly');
        const req = tx.objectStore(STORE_OUTFITS).get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(this.memoryStore.outfits.get(id) ?? null);
      } catch {
        resolve(this.memoryStore.outfits.get(id) ?? null);
      }
    });
  }

  async saveOutfits(items: OutfitItem[]): Promise<void> {
    for (const item of items) {
      this.memoryStore.outfits.set(item.id, item);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_OUTFITS, 'readwrite');
        const store = tx.objectStore(STORE_OUTFITS);
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async saveOutfit(item: OutfitItem): Promise<void> {
    return this.saveOutfits([item]);
  }

  async removeOutfit(id: string): Promise<void> {
    return this.removeOutfits([id]);
  }

  async removeOutfits(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.memoryStore.outfits.delete(id);
    }
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_OUTFITS, 'readwrite');
        const store = tx.objectStore(STORE_OUTFITS);
        for (const id of ids) {
          store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async clearOutfits(): Promise<void> {
    this.memoryStore.outfits.clear();
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_OUTFITS, 'readwrite');
        tx.objectStore(STORE_OUTFITS).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async queryClothes(query: ClothesFilters): Promise<{ items: ClothesItem[]; total: number }> {
    const all = await this.getAllClothes();
    const laundry = await this.getLaundry();
    const washingIds = laundry.washing;
    const ironingIds = laundry.ironing;
    const washingCountMap = new Map<string, number>();
    for (const id of washingIds) {
      washingCountMap.set(id, (washingCountMap.get(id) ?? 0) + 1);
    }
    const ironingCountMap = new Map<string, number>();
    for (const id of ironingIds) {
      ironingCountMap.set(id, (ironingCountMap.get(id) ?? 0) + 1);
    }

    let result = all.map((item) => ({
      ...item,
      isInWashing: (washingCountMap.get(item.id) ?? 0) > 0,
      washingQuantity: washingCountMap.get(item.id) ?? 0,
      isInIroning: (ironingCountMap.get(item.id) ?? 0) > 0,
      ironingQuantity: ironingCountMap.get(item.id) ?? 0,
    }));

    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.name?.toLowerCase().includes(q) ||
          item.fullTitle?.toLowerCase().includes(q) ||
          item.brand?.name?.toLowerCase().includes(q) ||
          item.type?.name?.toLowerCase().includes(q) ||
          item.notes?.toLowerCase().includes(q) ||
          item.code?.toLowerCase().includes(q),
      );
    }
    if (query.brand_id) {
      const brandIds = String(query.brand_id).split(',').map((s) => s.trim()).filter(Boolean);
      if (brandIds.length > 0) {
        result = result.filter((i) => i.brand?.id && brandIds.includes(i.brand.id));
      }
    }
    if (query.fit_id) {
      const fitIds = String(query.fit_id).split(',').map((s) => s.trim()).filter(Boolean);
      if (fitIds.length > 0) {
        result = result.filter((i) => i.fit?.id && fitIds.includes(i.fit.id));
      }
    }
    if (query.type_ids && query.type_ids.length > 0) {
      result = result.filter((i) => i.type?.id && query.type_ids!.includes(i.type.id));
    }
    if (query.tag_ids && query.tag_ids.length > 0) {
      result = result.filter((i) => i.tags?.some((t) => query.tag_ids!.includes(t.id)));
    }
    if (query.color_ids && query.color_ids.length > 0) {
      result = result.filter((i) => i.colors?.some((c) => query.color_ids!.includes(c.id)));
    }
    if (query.material_ids && query.material_ids.length > 0) {
      result = result.filter((i) => i.materials?.some((m) => query.material_ids!.includes(m.id)));
    }
    if (query.season_ids && query.season_ids.length > 0) {
      result = result.filter((i) => i.seasons?.some((s) => query.season_ids!.includes(s.id)));
    }
    if (query.temperature_ids && query.temperature_ids.length > 0) {
      result = result.filter((i) => i.temperatures?.some((t) => query.temperature_ids!.includes(t.id)));
    }
    if (query.use_case_ids && query.use_case_ids.length > 0) {
      result = result.filter((i) => i.useCases?.some((u) => query.use_case_ids!.includes(u.id)));
    }
    if (query.size?.trim()) {
      result = result.filter((i) => i.size === query.size);
    }

    result.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const total = result.length;
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.max(1, query.per_page ?? 50);
    const paginated = result.slice((page - 1) * perPage, page * perPage);

    return { items: paginated, total };
  }

  // Sync Queue methods
  async getQueue(): Promise<SyncQueueItem[]> {
    const db = await this.getDB();
    if (!db) {
      return [...this.memoryStore.queue];
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_QUEUE, 'readonly');
        const req = tx.objectStore(STORE_QUEUE).getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => resolve([...this.memoryStore.queue]);
      } catch {
        resolve([...this.memoryStore.queue]);
      }
    });
  }

  async enqueue(item: SyncQueueItem): Promise<void> {
    this.memoryStore.queue.push(item);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        tx.objectStore(STORE_QUEUE).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async enqueueBatch(items: SyncQueueItem[]): Promise<void> {
    if (!items.length) return;
    this.memoryStore.queue.push(...items);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        const store = tx.objectStore(STORE_QUEUE);
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async removeQueueItems(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    this.memoryStore.queue = this.memoryStore.queue.filter((item) => !idSet.has(item.id));

    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        const store = tx.objectStore(STORE_QUEUE);
        for (const id of ids) {
          store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async clearQueue(): Promise<void> {
    this.memoryStore.queue = [];
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        tx.objectStore(STORE_QUEUE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // Metadata methods
  async getMetadata(): Promise<StorageMetadata> {
    const db = await this.getDB();
    if (!db) {
      return { ...this.memoryStore.meta };
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_META, 'readonly');
        const req = tx.objectStore(STORE_META).get('sync_meta');
        req.onsuccess = () => {
          if (req.result) {
            resolve({
              lastSyncAt: req.result.lastSyncAt ?? null,
              lastSyncStatus: req.result.lastSyncStatus ?? 'online-ok',
              conflicts: req.result.conflicts ?? [],
            });
          } else {
            resolve({ ...this.memoryStore.meta });
          }
        };
        req.onerror = () => resolve({ ...this.memoryStore.meta });
      } catch {
        resolve({ ...this.memoryStore.meta });
      }
    });
  }

  async setMetadata(data: Partial<StorageMetadata>): Promise<void> {
    this.memoryStore.meta = { ...this.memoryStore.meta, ...data };
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).put({
          key: 'sync_meta',
          ...this.memoryStore.meta,
          ...data,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

