import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import { ApiService } from './api.service';
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
  private readonly api = inject(ApiService);

  private readonly state = signal<ReferenceState>({ ...emptyState });
  readonly loading = signal(false);

  private readonly sortableKinds: ReferenceKind[] = ['colors', 'seasons', 'temperatures', 'use-cases', 'fits', 'materials'];

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

  readonly colors = computed(() => this.sortForKind('colors', this.state().colors));
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

  async loadAll() {
    this.loading.set(true);
    try {
      const { colors, brands, seasons, temperatures, useCases, fits, materials, types, tags } = await firstValueFrom(forkJoin({
        colors: this.api.listReference('colors'),
        brands: this.api.listReference('brands'),
        seasons: this.api.listReference('seasons'),
        temperatures: this.api.listReference('temperatures'),
        useCases: this.api.listReference('use-cases'),
        fits: this.api.listReference('fits'),
        materials: this.api.listReference('materials'),
        types: this.api.listReference('types'),
        tags: this.api.listReference('tags'),
      }));

      this.state.set({
        colors: (colors ?? []) as ColorItem[],
        brands: (brands ?? []) as BrandItem[],
        seasons: (seasons ?? []) as SeasonItem[],
        temperatures: (temperatures ?? []) as TemperatureItem[],
        'use-cases': (useCases ?? []) as UseCaseItem[],
        fits: (fits ?? []) as FitItem[],
        materials: (materials ?? []) as MaterialItem[],
        types: (types ?? []) as TypeItem[],
        tags: (tags ?? []) as TagItem[],
      });
    } finally {
      this.loading.set(false);
    }
  }

  async load(kind: ReferenceKind) {
    const items = await firstValueFrom(this.api.listReference(kind));
    this.patch(kind, items ?? []);
  }

  async create(kind: ReferenceKind, payload: Record<string, unknown>) {
    const item = await firstValueFrom(this.api.createReference(kind, payload));
    if (item) {
      this.patchAppend(kind, item as BaseReferenceItem);
    }
    return item;
  }

  async update(kind: ReferenceKind, id: string, payload: Record<string, unknown>) {
    const item = await firstValueFrom(this.api.updateReference(kind, id, payload));
    if (item) {
      this.patchReplace(kind, item as BaseReferenceItem);
    }
    return item;
  }

  async remove(kind: ReferenceKind, id: string) {
    await firstValueFrom(this.api.deleteReference(kind, id));
    this.patchRemove(kind, id);
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