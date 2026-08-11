import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { AttachmentItem, ClothesFilters, ClothesItem } from '../../../../core/models';
import { normalizeHexColor } from '../../../../shared/utils/color.utils';

interface FilterPillOption {
  id: string;
  label: string;
  emoji?: string;
  colorHex?: string;
}

interface FilterGroup {
  key: FilterKey;
  label: string;
  options: FilterPillOption[];
}

interface NamedMetaItem {
  name?: string | null;
}

type FilterKey = 'brand_ids' | 'fit_ids' | 'type_ids' | 'tag_ids' | 'color_ids' | 'material_ids' | 'season_ids' | 'temperature_ids' | 'use_case_ids';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 12;

const QUERY_PARAM_KEYS = [
  'search',
  'size',
  'brand_id',
  'fit_id',
  'type_ids',
  'tag_ids',
  'color_ids',
  'material_ids',
  'season_ids',
  'temperature_ids',
  'use_case_ids',
  'page',
  'per_page',
] as const;

type KnownQueryParamKey = (typeof QUERY_PARAM_KEYS)[number];

const initialFilters = (query: Record<string, string>) => ({
  size: query['size'] ?? '',
  brand_ids: query['brand_id'] ? query['brand_id'].split(',').filter(Boolean) : [],
  fit_ids: query['fit_id'] ? query['fit_id'].split(',').filter(Boolean) : [],
  type_ids: (query['type_ids'] || query['type_id'] || '').split(',').filter(Boolean),
  tag_ids: query['tag_ids'] ? query['tag_ids'].split(',').filter(Boolean) : [],
  color_ids: query['color_ids'] ? query['color_ids'].split(',').filter(Boolean) : [],
  material_ids: query['material_ids'] ? query['material_ids'].split(',').filter(Boolean) : [],
  season_ids: query['season_ids'] ? query['season_ids'].split(',').filter(Boolean) : [],
  temperature_ids: query['temperature_ids'] ? query['temperature_ids'].split(',').filter(Boolean) : [],
  use_case_ids: query['use_case_ids'] ? query['use_case_ids'].split(',').filter(Boolean) : [],
  page: Number(query['page'] ?? DEFAULT_PAGE) || DEFAULT_PAGE,
  per_page: Number(query['per_page'] ?? DEFAULT_PER_PAGE) || DEFAULT_PER_PAGE,
});

@Component({
  standalone: true,
  imports: [CommonModule, FormField, RouterLink],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class WardrobePageComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly referenceStore = inject(ReferenceStoreService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private routeSubscription: Subscription | null = null;
  private isHydratingFromUrl = false;

  readonly searchModel = signal({
    text: '',
  });
  readonly searchForm = form(this.searchModel);
  readonly debouncedSearch = signal('');

  readonly filters = signal(initialFilters(Object.fromEntries(new URLSearchParams(window.location.search))));
  readonly filtersOpen = signal(false);
  readonly items = signal<ClothesItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly brandOptions = this.referenceStore.brands;
  readonly fitOptions = this.referenceStore.fits;
  readonly colorOptions = this.referenceStore.colors;
  readonly materialOptions = this.referenceStore.materials;
  readonly seasonOptions = this.referenceStore.seasons;
  readonly temperatureOptions = this.referenceStore.temperatures;
  readonly useCaseOptions = this.referenceStore.useCases;
  readonly typeOptions = this.referenceStore.types;
  readonly tagOptions = this.referenceStore.tags;

  readonly brandFilterOptions = computed<FilterPillOption[]>(() =>
    this.brandOptions().map((brand) => ({ id: brand.id, label: brand.name, emoji: '🏷️' })),
  );

  readonly fitFilterOptions = computed<FilterPillOption[]>(() =>
    this.fitOptions().map((fit) => ({ id: fit.id, label: fit.name, emoji: '📏' })),
  );

  readonly colorFilterOptions = computed<FilterPillOption[]>(() =>
    this.colorOptions().map((color) => ({
      id: color.id,
      label: color.name,
      colorHex: this.resolveColorHex(color.hexCode),
    })),
  );

  readonly materialFilterOptions = computed<FilterPillOption[]>(() =>
    this.materialOptions().map((material) => ({ id: material.id, label: material.name, emoji: '🧵' })),
  );

  readonly seasonFilterOptions = computed<FilterPillOption[]>(() =>
    this.seasonOptions().map((season) => ({ id: season.id, label: season.name, emoji: season.icon || '🗓️' })),
  );

  readonly temperatureFilterOptions = computed<FilterPillOption[]>(() =>
    this.temperatureOptions().map((temperature) => ({ id: temperature.id, label: temperature.name, emoji: temperature.icon || '🌡️' })),
  );

  readonly useCaseFilterOptions = computed<FilterPillOption[]>(() =>
    this.useCaseOptions().map((useCase) => ({ id: useCase.id, label: useCase.name, emoji: useCase.icon || '✨' })),
  );

  readonly typeFilterOptions = computed<FilterPillOption[]>(() =>
    this.typeOptions().map((type) => ({ id: type.id, label: type.name, emoji: '🧩' })),
  );

  readonly tagFilterOptions = computed<FilterPillOption[]>(() =>
    this.tagOptions().map((tag) => ({ id: tag.id, label: tag.name, emoji: '#' })),
  );

  readonly filterGroups = computed<FilterGroup[]>(() => [
    { key: 'season_ids', label: 'Stagioni', options: this.seasonFilterOptions() },
    { key: 'temperature_ids', label: 'Temperature', options: this.temperatureFilterOptions() },
    { key: 'color_ids', label: 'Colori', options: this.colorFilterOptions() },
    { key: 'use_case_ids', label: 'Occasioni', options: this.useCaseFilterOptions() },
    { key: 'type_ids', label: 'Tipi', options: this.typeFilterOptions() },
    { key: 'tag_ids', label: 'Tag', options: this.tagFilterOptions() },
    { key: 'brand_ids', label: 'Brand', options: this.brandFilterOptions() },
    { key: 'fit_ids', label: 'Fit', options: this.fitFilterOptions() },
    { key: 'material_ids', label: 'Materiali', options: this.materialFilterOptions() },
  ]);

  readonly query = computed<ClothesFilters>(() => {
    const current = this.filters();

    return {
      search: this.debouncedSearch(),
      brand_id: current.brand_ids.join(','),
      fit_id: current.fit_ids.join(','),
      size: current.size,
      type_ids: current.type_ids,
      tag_ids: current.tag_ids,
      color_ids: current.color_ids,
      material_ids: current.material_ids,
      season_ids: current.season_ids,
      temperature_ids: current.temperature_ids,
      use_case_ids: current.use_case_ids,
      page: current.page,
      per_page: current.per_page,
    };
  });

  readonly activeFilterCount = computed(() => {
    const state = this.filters();
    return (
      state.brand_ids.length +
      state.fit_ids.length +
      state.type_ids.length +
      state.tag_ids.length +
      state.color_ids.length +
      state.material_ids.length +
      state.season_ids.length +
      state.temperature_ids.length +
      state.use_case_ids.length
    );
  });

  readonly hasActiveFilters = computed(() => this.activeFilterCount() > 0 || this.debouncedSearch().trim().length > 0);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.filters().per_page)));

  constructor() {
    effect(() => {
      const searchTerm = this.searchForm.text().value();
      if (this.debounceHandle) {
        clearTimeout(this.debounceHandle);
      }

      this.debounceHandle = setTimeout(() => {
        this.debouncedSearch.set(searchTerm);
      }, 250);
    });

      effect(() => {
        const query = this.query();
        if (this.isHydratingFromUrl) {
          return;
        }

        void this.syncUrlFromState(query);
      });

    effect(() => {
      const query = this.query();
      void this.load(query);
    });
  }

  ngOnInit() {
      this.routeSubscription = this.route.queryParamMap.subscribe((queryParamMap) => {
        const query = Object.fromEntries(queryParamMap.keys.map((key) => [key, queryParamMap.get(key) ?? '']));
        const nextFilters = initialFilters(query);
        const nextSearch = query['search'] ?? '';

        this.isHydratingFromUrl = true;
        this.filters.set(nextFilters);
        this.searchForm.text().value.set(nextSearch);
        this.debouncedSearch.set(nextSearch);
        this.isHydratingFromUrl = false;
      });
  }

  ngOnDestroy() {
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }

      this.routeSubscription?.unsubscribe();
  }

  trackById = (_: number, item: ClothesItem) => item.id;

  trackFilterGroup = (_: number, group: FilterGroup) => group.key;

  trackFilterOption = (_: number, option: FilterPillOption) => option.id;

  isFilterSelected(key: FilterKey, id: string) {
    return this.filters()[key].includes(id);
  }

  toggleFilter(key: FilterKey, id: string) {
    const selectedIds = this.filters()[key];
    if (selectedIds.includes(id)) {
      this.setMultiFilter(key, selectedIds.filter((selectedId) => selectedId !== id));
      this.closeFiltersOnMobile();
      return;
    }
    this.setMultiFilter(key, [...selectedIds, id]);
    this.closeFiltersOnMobile();
  }

  getPrimaryAttachment(item: ClothesItem): AttachmentItem | null {
    const attachments = item.attachments ?? [];
    const imageAttachment = attachments.find((attachment) => attachment.mimeType?.startsWith('image/'));
    return imageAttachment ?? attachments[0] ?? null;
  }

  getAttachmentUrl(item: ClothesItem, attachment: AttachmentItem) {
    return `/api/clothes/${item.id}/attachments/${attachment.id}/file`;
  }

  getPreferredLabel(item: ClothesItem) {
    if (item.name?.trim()) {
      return item.name.trim();
    }

    const type = item.type?.name?.trim() ?? '';
    const color = item.colors?.[0]?.name?.trim() ?? '';

    if (type && color) {
      return `${type} ${color}`;
    }

    return type || color || 'Capo senza nome';
  }

  setMultiFilter(key: FilterKey, nextIds: string[]) {
    const unique = Array.from(new Set(nextIds));
    this.filters.update((current) => ({ ...current, [key]: unique, page: 1 }));
  }

  setPage(page: number) {
    this.filters.update((current) => ({ ...current, page }));
  }

  clearFilters() {
    this.searchForm.text().value.set('');
    this.debouncedSearch.set('');
    this.filters.set({
      size: '',
      brand_ids: [],
      fit_ids: [],
      type_ids: [],
      tag_ids: [],
      color_ids: [],
      material_ids: [],
      season_ids: [],
      temperature_ids: [],
      use_case_ids: [],
      page: DEFAULT_PAGE,
      per_page: DEFAULT_PER_PAGE,
    });

    this.closeFiltersOnMobile();
  }

  toggleFilters() {
    this.filtersOpen.update((open) => !open);
  }

  closeFilters() {
    this.filtersOpen.set(false);
  }

  resolveColorHex(hexCode: string | null) {
    return normalizeHexColor(hexCode);
  }

  hasItems<T>(items: T[] | null | undefined) {
    return (items?.length ?? 0) > 0;
  }

  listItemNames(items: NamedMetaItem[] | null | undefined) {
    return this.extractItemNames(items).join(', ');
  }

  async load(query: ClothesFilters) {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(this.api.listClothes(query));
      this.items.set(response?.items ?? []);
      this.total.set(response?.total ?? 0);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile caricare il guardaroba');
    } finally {
      this.loading.set(false);
    }
  }

  private closeFiltersOnMobile() {
    if (window.matchMedia('(max-width: 900px)').matches) {
      this.closeFilters();
    }
  }

  private extractItemNames(items: NamedMetaItem[] | null | undefined) {
    if (!items || items.length === 0) {
      return [];
    }

    return items
      .map((item) => item.name?.trim() ?? '')
      .filter((name): name is string => Boolean(name));
  }

  private async syncUrlFromState(query: ClothesFilters) {
    const nextParams = this.toQueryParams(query);
    if (this.hasSameQueryParams(nextParams)) {
      return;
    }

    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: nextParams,
    });
  }

  private toQueryParams(query: ClothesFilters): Partial<Record<KnownQueryParamKey, string>> {
    const search = query.search.trim();
    const size = query.size.trim();

    const params: Partial<Record<KnownQueryParamKey, string>> = {};
    if (search) params.search = search;
    if (size) params.size = size;
    if (query.brand_id) params.brand_id = query.brand_id;
    if (query.fit_id) params.fit_id = query.fit_id;
    if (query.type_ids.length > 0) params.type_ids = query.type_ids.join(',');
    if (query.tag_ids.length > 0) params.tag_ids = query.tag_ids.join(',');
    if (query.color_ids.length > 0) params.color_ids = query.color_ids.join(',');
    if (query.material_ids.length > 0) params.material_ids = query.material_ids.join(',');
    if (query.season_ids.length > 0) params.season_ids = query.season_ids.join(',');
    if (query.temperature_ids.length > 0) params.temperature_ids = query.temperature_ids.join(',');
    if (query.use_case_ids.length > 0) params.use_case_ids = query.use_case_ids.join(',');
    if (query.page > DEFAULT_PAGE) params.page = String(query.page);
    if (query.per_page !== DEFAULT_PER_PAGE) params.per_page = String(query.per_page);

    return params;
  }

  private hasSameQueryParams(nextParams: Partial<Record<KnownQueryParamKey, string>>) {
    const current = this.route.snapshot.queryParamMap;

    for (const key of QUERY_PARAM_KEYS) {
      const nextValue = nextParams[key] ?? null;
      const currentValue = current.get(key);
      if (nextValue !== currentValue) {
        return false;
      }
    }

    return true;
  }
}