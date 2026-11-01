import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { OfflineStorageService } from './offline-storage.service';
import { SyncService } from './sync.service';
import { sortColorsByHex } from '../shared/utils/color.utils';
import {
  BaseReferenceItem,
  BrandItem,
  ColorItem,
  FitItem,
  MaterialItem,
  ReferenceKind,
  SeasonItem,
  TagItem,
  TemperatureItem,
  TypeItem,
  UseCaseItem,
} from './models';

type ReferenceState = {
  colors: ColorItem[];
  brands: BrandItem[];
  seasons: SeasonItem[];
  temperatures: TemperatureItem[];
  'use-cases': UseCaseItem[];
  fits: FitItem[];
  materials: MaterialItem[];
  types: TypeItem[];
  tags: TagItem[];
};

type ReferenceItem = ColorItem | BrandItem | SeasonItem | TemperatureItem | UseCaseItem | FitItem | MaterialItem | TypeItem | TagItem;

const emptyState: ReferenceState = {
  colors: [],
  brands: [],
  seasons: [],
  temperatures: [],
  'use-cases': [],
  fits: [],
  materials: [],
  types: [],
  tags: [],
};

@Injectable({ providedIn: 'root' })
export class ReferenceStoreService {
  private readonly storage = inject(OfflineStorageService, { optional: true });
  private readonly syncService = inject(SyncService, { optional: true });

  private readonly state = signal<ReferenceState>({ ...emptyState });
  readonly loading = signal(false);

  constructor() {
    const sync = this.syncService;
    if (sync) {
      effect(() => {
        sync.dataUpdated();
        void this.loadAll({ silent: true });
      });
    }
  }

  private readonly sortableKinds: ReferenceKind[] = ['seasons', 'temperatures', 'use-cases', 'fits', 'materials'];

  private isSortableKind(kind: ReferenceKind) {
    return this.sortableKinds.includes(kind);
  }

  private bySortOrderThenName(left: BaseReferenceItem, right: BaseReferenceItem) {
    const leftSort = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
    const rightSort = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;
    const bySort = leftSort - rightSort;
    if (bySort !== 0) {
      return bySort;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  }

  private byName(left: BaseReferenceItem, right: BaseReferenceItem) {
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  }

  private sortForKind<T extends BaseReferenceItem>(kind: ReferenceKind, items: T[]) {
    return this.isSortableKind(kind)
      ? items.slice().sort((left, right) => this.bySortOrderThenName(left, right))
      : items.slice().sort((left, right) => this.byName(left, right));
  }

  readonly colors = computed(() => sortColorsByHex(this.state().colors));
  readonly brands = computed(() => this.sortForKind('brands', this.state().brands));
  readonly seasons = computed(() => this.sortForKind('seasons', this.state().seasons));
  readonly temperatures = computed(() => this.sortForKind('temperatures', this.state().temperatures));
  readonly useCases = computed(() => this.sortForKind('use-cases', this.state()['use-cases']));
  readonly fits = computed(() => this.sortForKind('fits', this.state().fits));
  readonly materials = computed(() => this.sortForKind('materials', this.state().materials));
  readonly types = computed(() => this.sortForKind('types', this.state().types));
  readonly tags = computed(() => this.sortForKind('tags', this.state().tags));

  readonly isLoaded = computed(() =>
    Object.entries(this.state()).every(([kind, list]) => {
      if (!Array.isArray(list)) {
        return false;
      }

      // Tags are user-defined and may legitimately be empty.
      if (kind === 'tags') {
        return true;
      }

      return list.length > 0;
    }),
  );

  async loadAll(options?: { silent?: boolean }) {
    if (!options?.silent && !this.isLoaded()) {
      this.loading.set(true);
    }
    try {
      if (this.storage) {
        const cached = await this.storage.getAllReferenceData();
        const nextState: ReferenceState = {
          colors: (cached['colors'] ?? []) as ColorItem[],
          brands: (cached['brands'] ?? []) as BrandItem[],
          seasons: (cached['seasons'] ?? []) as SeasonItem[],
          temperatures: (cached['temperatures'] ?? []) as TemperatureItem[],
          'use-cases': (cached['use-cases'] ?? []) as UseCaseItem[],
          fits: (cached['fits'] ?? []) as FitItem[],
          materials: (cached['materials'] ?? []) as MaterialItem[],
          types: (cached['types'] ?? []) as TypeItem[],
          tags: (cached['tags'] ?? []) as TagItem[],
        };

        if (this.hasStateChanged(this.state(), nextState)) {
          this.state.set(nextState);
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  private hasStateChanged(curr: ReferenceState, next: ReferenceState): boolean {
    const kinds: (keyof ReferenceState)[] = [
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
    for (const kind of kinds) {
      const c = curr[kind] ?? [];
      const n = next[kind] ?? [];
      if (c.length !== n.length) return true;
      for (let i = 0; i < c.length; i++) {
        if (
          c[i].id !== n[i].id ||
          c[i].updatedAt !== n[i].updatedAt ||
          c[i].name !== n[i].name ||
          (c[i] as any).hexCode !== (n[i] as any).hexCode ||
          (c[i] as any).sortOrder !== (n[i] as any).sortOrder
        ) {
          return true;
        }
      }
    }
    return false;
  }

  async load(kind: ReferenceKind) {
    if (this.storage) {
      const cached = await this.storage.getReferenceData(kind);
      const curr = this.state()[kind] ?? [];
      const changed =
        curr.length !== cached.length ||
        curr.some((item, idx) => {
          const other = cached[idx];
          return (
            !other ||
            item.id !== other.id ||
            item.updatedAt !== other.updatedAt ||
            item.name !== other.name ||
            (item as any).hexCode !== (other as any).hexCode ||
            (item as any).sortOrder !== (other as any).sortOrder
          );
        });
      if (changed) {
        this.patch(kind, cached);
      }
    }
  }

  async create(kind: ReferenceKind, payload: Record<string, unknown>) {
    const localId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ref_${Date.now()}`;
    const localItem: BaseReferenceItem = {
      id: localId,
      userId: '',
      name: String(payload['name'] ?? ''),
      sortOrder: Number(payload['sortOrder'] ?? 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(kind === 'colors' ? { hexCode: (payload['hexCode'] as string) ?? null } : {}),
    };
    this.patchAppend(kind, localItem);
    if (this.storage) {
      await this.storage.saveReferenceData(kind, [localItem]);
    }
    if (this.syncService) {
      await this.syncService.queueReferenceChange(kind, localId, 'create', payload);
    }
    return localItem;
  }

  async update(kind: ReferenceKind, id: string, payload: Record<string, unknown>) {
    const existing = this.state()[kind].find((x) => x.id === id);
    const updated: BaseReferenceItem = {
      ...(existing ?? ({} as BaseReferenceItem)),
      id,
      name: payload['name'] !== undefined ? String(payload['name']) : existing?.name ?? '',
      sortOrder: payload['sortOrder'] !== undefined ? Number(payload['sortOrder']) : existing?.sortOrder ?? 0,
      updatedAt: new Date().toISOString(),
    };
    this.patchReplace(kind, updated);
    if (this.storage) {
      await this.storage.saveReferenceData(kind, [updated]);
    }
    if (this.syncService) {
      await this.syncService.queueReferenceChange(kind, id, 'update', payload);
    }
    return updated;
  }

  async remove(kind: ReferenceKind, id: string) {
    this.patchRemove(kind, id);
    if (this.storage) {
      await this.storage.removeReferenceData(kind, [id]);
    }
    if (this.syncService) {
      await this.syncService.queueReferenceChange(kind, id, 'delete');
    }
  }

  snapshot(kind: ReferenceKind) {
    return [...this.state()[kind]] as ReferenceItem[];
  }

  restore(kind: ReferenceKind, snapshot: ReferenceItem[]) {
    this.state.update((current) => ({ ...current, [kind]: [...snapshot] as never }));
  }

  applyOptimisticOrder(kind: ReferenceKind, orderedIds: string[]) {
    const previous = this.snapshot(kind);
    const byId = new Map(previous.map((item) => [item.id, item]));

    const reordered: ReferenceItem[] = orderedIds
      .map((id, index) => {
        const existing = byId.get(id);
        if (!existing) {
          return null;
        }

        return { ...existing, sortOrder: index };
      })
      .filter((item): item is ReferenceItem => item !== null);

    for (const item of previous) {
      if (!orderedIds.includes(item.id)) {
        reordered.push(item);
      }
    }

    this.state.update((current) => ({ ...current, [kind]: reordered as never }));
    return previous;
  }

  itemsFor(kind: ReferenceKind) {
    return computed(() => this.state()[kind]);
  }

  private patch(kind: ReferenceKind, items: ReferenceItem[]) {
    this.state.update((current) => ({ ...current, [kind]: [...items] }));
  }

  private patchAppend(kind: ReferenceKind, item: BaseReferenceItem) {
    this.state.update((current) => ({ ...current, [kind]: [...current[kind], item as never] }));
  }

  private patchReplace(kind: ReferenceKind, item: BaseReferenceItem) {
    this.state.update((current) => ({
      ...current,
      [kind]: current[kind].map((existing) => (existing.id === item.id ? (item as never) : existing)),
    }));
  }

  private patchRemove(kind: ReferenceKind, id: string) {
    this.state.update((current) => ({
      ...current,
      [kind]: current[kind].filter((item) => item.id !== id),
    }));
  }
}