import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { LaundryService } from '../../../../core/laundry.service';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { ToastService } from '../../../../core/toast.service';
import { WardrobeSelectionService } from '../../services/wardrobe-selection.service';
import { AttachmentItem, ClothesFilters, ClothesItem, OutfitDetailResponse } from '../../../../core/models';
import { normalizeHexColor } from '../../../../shared/utils/color.utils';
import { ButtonComponent } from '../../../../shared/components/button';
import { WashingIconComponent, IroningIconComponent } from '../../../../shared/components/icons';
import { OutfitSelectModalComponent } from '../../../outfits/components/outfit-select-modal/outfit-select-modal.component';
import { ClothesCardComponent } from '../../components/clothes-card/clothes-card.component';

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
const DEFAULT_PER_PAGE = 50;

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

const initialFilters = (query: Record<string, string>) => {
  const parsedPerPage = Number(query['per_page'] ?? DEFAULT_PER_PAGE);
  return {
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
    per_page: parsedPerPage > 0 ? Math.min(100, parsedPerPage) : DEFAULT_PER_PAGE,
  };
};

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormField,
    RouterLink,
    ButtonComponent,
    WashingIconComponent,
    IroningIconComponent,
    ClothesCardComponent,
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class WardrobePageComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly storage = inject(OfflineStorageService, { optional: true });
  private readonly syncService = inject(SyncService, { optional: true });
  private readonly referenceStore = inject(ReferenceStoreService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  readonly selectionService = inject(WardrobeSelectionService);
  readonly laundryService = inject(LaundryService);
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private routeSubscription: Subscription | null = null;
  private isHydratingFromUrl = false;

  readonly searchModel = signal({
    text: '',
  });
  readonly searchForm = form(this.searchModel);
  readonly debouncedSearch = signal('');

  @ViewChild('filtersSidebar') filtersSidebar?: ElementRef<HTMLElement>;
  @ViewChild('filtersBackdrop') filtersBackdrop?: ElementRef<HTMLElement>;

  private touchStartX = 0;
  private touchStartY = 0;
  private touchCurrentX = 0;
  private touchStartTime = 0;
  private isTouchTracking = false;
  private isDraggingFilters = false;
  private dragDirectionLocked: 'horizontal' | 'vertical' | null = null;
  private sidebarDragInitialState: 'open' | 'closed' = 'closed';
  private snapTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly touchStartListener = (e: TouchEvent) => this.onTouchStart(e);
  private readonly touchMoveListener = (e: TouchEvent) => this.onTouchMove(e);
  private readonly touchEndListener = (e: TouchEvent) => this.onTouchEnd(e);
  private readonly touchCancelListener = () => this.onTouchCancel();

  readonly filters = signal(initialFilters(Object.fromEntries(new URLSearchParams(window.location.search))));
  readonly filtersOpen = signal(false);
  readonly items = signal<ClothesItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pendingActionIds = signal<Set<string>>(new Set());

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

  readonly defaultPageSizeOptions = [12, 25, 50, 100];

  readonly pageSizeOptions = computed(() => {
    const current = this.filters().per_page;
    if (!this.defaultPageSizeOptions.includes(current)) {
      return [...this.defaultPageSizeOptions, current].sort((a, b) => a - b);
    }
    return this.defaultPageSizeOptions;
  });

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
      // Track sync updates to reload from IndexedDB
      this.syncService?.dataUpdated();
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

    if (typeof window !== 'undefined') {
      window.addEventListener('touchstart', this.touchStartListener, { passive: true });
      window.addEventListener('touchmove', this.touchMoveListener, { passive: false });
      window.addEventListener('touchend', this.touchEndListener, { passive: true });
      window.addEventListener('touchcancel', this.touchCancelListener, { passive: true });
    }
  }

  ngOnDestroy() {
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }

    this.routeSubscription?.unsubscribe();

    if (typeof window !== 'undefined') {
      window.removeEventListener('touchstart', this.touchStartListener);
      window.removeEventListener('touchmove', this.touchMoveListener);
      window.removeEventListener('touchend', this.touchEndListener);
      window.removeEventListener('touchcancel', this.touchCancelListener);
    }

    if (this.snapTimeout) {
      clearTimeout(this.snapTimeout);
      this.snapTimeout = null;
    }
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
    const variant = attachment.previewPath ? '?variant=preview' : '';
    return `/api/clothes/${item.id}/attachments/${attachment.id}/file${variant}`;
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

  setPerPage(perPage: number) {
    if (perPage === this.filters().per_page) {
      return;
    }
    this.filters.update((current) => ({
      ...current,
      per_page: perPage,
      page: 1,
    }));
  }

  onPerPageChange(event: Event) {
    const target = event.target as HTMLSelectElement | null;
    if (!target) {
      return;
    }
    const value = Number(target.value);
    if (value > 0) {
      this.setPerPage(value);
    }
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
      per_page: this.filters().per_page,
    });

    this.closeFiltersOnMobile();
  }

  toggleFilters() {
    if (this.filtersOpen()) {
      this.closeFilters();
    } else {
      this.clearSidebarInlineStyles();
      this.filtersOpen.set(true);
    }
  }

  closeFilters() {
    this.clearSidebarInlineStyles();
    this.filtersOpen.set(false);
  }

  private isMobileTablet(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(max-width: 900px)').matches;
  }

  private isTouchCapable(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return (
      'ontouchstart' in window ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    );
  }

  private onTouchStart(e: TouchEvent) {
    this.resetDragState();

    if (!this.isMobileTablet() || !this.isTouchCapable()) {
      return;
    }
    if (e.touches.length !== 1) {
      return;
    }

    const touch = e.touches[0];
    const target = touch.target as HTMLElement | null;
    if (target?.closest('input, textarea, select')) {
      return;
    }

    const isClosed = !this.filtersOpen();
    const isRightThird = touch.clientX >= window.innerWidth * (2 / 3);
    if (isClosed && !isRightThird) {
      return;
    }

    if (this.snapTimeout) {
      clearTimeout(this.snapTimeout);
      this.snapTimeout = null;
    }

    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchCurrentX = touch.clientX;
    this.touchStartTime = Date.now();
    this.dragDirectionLocked = null;
    this.isDraggingFilters = false;
    this.sidebarDragInitialState = this.filtersOpen() ? 'open' : 'closed';
    this.isTouchTracking = true;
  }

  private onTouchMove(e: TouchEvent) {
    if (!this.isTouchTracking) {
      return;
    }

    if (!this.isMobileTablet() || !this.isTouchCapable()) {
      this.resetDragState();
      return;
    }
    if (e.touches.length !== 1) {
      return;
    }

    const touch = e.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (!this.dragDirectionLocked) {
      if (absDeltaX < 8 && absDeltaY < 8) {
        return;
      }
      if (absDeltaY >= absDeltaX) {
        this.dragDirectionLocked = 'vertical';
        return;
      }

      if (this.sidebarDragInitialState === 'closed') {
        // Dragging from right to left (deltaX < 0) opens filters only if started from the right 1/3
        const isRightThird = this.touchStartX >= window.innerWidth * (2 / 3);
        if (deltaX < 0 && isRightThird) {
          this.dragDirectionLocked = 'horizontal';
          this.isDraggingFilters = true;
        } else {
          this.dragDirectionLocked = 'vertical';
          return;
        }
      } else {
        // When open, dragging left to right (deltaX > 0) closes filters
        if (deltaX > 0) {
          this.dragDirectionLocked = 'horizontal';
          this.isDraggingFilters = true;
        } else {
          this.dragDirectionLocked = 'vertical';
          return;
        }
      }
    }

    if (!this.isDraggingFilters) {
      return;
    }

    if (e.cancelable) {
      e.preventDefault();
    }

    this.touchCurrentX = touch.clientX;
    this.updateSidebarPositionDuringDrag();
  }

  private updateSidebarPositionDuringDrag() {
    const sidebarEl = this.filtersSidebar?.nativeElement;
    const backdropEl = this.filtersBackdrop?.nativeElement;
    if (!sidebarEl || !backdropEl) {
      return;
    }

    const windowWidth = window.innerWidth;
    const sidebarWidth = sidebarEl.offsetWidth || Math.min(360, windowWidth * 0.88);
    const restingLeft = windowWidth - sidebarWidth;

    let translateX = sidebarWidth;

    if (this.sidebarDragInitialState === 'closed') {
      const startX = this.touchStartX;
      const currentX = this.touchCurrentX;
      const dragDistance = Math.max(0, startX - currentX);
      const edgeOffset = Math.max(0, windowWidth - startX);
      const catchUpDistance = Math.max(30, edgeOffset);
      const progressToFinger = Math.min(1, dragDistance / catchUpDistance);
      const sidebarLeft = (windowWidth - dragDistance) * (1 - progressToFinger) + currentX * progressToFinger;
      const rawTranslateX = sidebarLeft - restingLeft;
      translateX = Math.max(0, Math.min(sidebarWidth, rawTranslateX));
    } else {
      const startX = this.touchStartX;
      const currentX = this.touchCurrentX;
      const dragDistance = Math.max(0, currentX - startX);
      translateX = Math.max(0, Math.min(sidebarWidth, dragDistance));
    }

    const progress = Math.max(0, Math.min(1, 1 - translateX / sidebarWidth));

    sidebarEl.style.transition = 'none';
    sidebarEl.style.transform = `translateX(${translateX}px)`;

    backdropEl.style.transition = 'none';
    backdropEl.style.visibility = progress > 0.005 ? 'visible' : 'hidden';
    backdropEl.style.opacity = progress.toFixed(3);
    backdropEl.style.pointerEvents = 'auto';
  }

  private onTouchEnd(e: TouchEvent) {
    if (!this.isTouchTracking) {
      return;
    }
    this.isTouchTracking = false;

    if (!this.isMobileTablet() || !this.isTouchCapable()) {
      this.resetDragState();
      return;
    }

    if (!this.isDraggingFilters) {
      this.resetDragState();
      return;
    }

    const sidebarEl = this.filtersSidebar?.nativeElement;
    const sidebarWidth = sidebarEl?.offsetWidth || Math.min(360, window.innerWidth * 0.88);

    const elapsed = Math.max(1, Date.now() - this.touchStartTime);
    const deltaX = this.touchCurrentX - this.touchStartX;
    const velocityX = deltaX / elapsed;

    if (this.sidebarDragInitialState === 'closed') {
      const dragDistance = this.touchStartX - this.touchCurrentX;
      const shouldOpen = dragDistance > sidebarWidth * 0.25 || (velocityX < -0.35 && dragDistance > 20);
      this.snapFilters(shouldOpen, sidebarWidth);
    } else {
      const dragDistance = this.touchCurrentX - this.touchStartX;
      const shouldClose = dragDistance > sidebarWidth * 0.25 || (velocityX > 0.35 && dragDistance > 20);
      this.snapFilters(!shouldClose, sidebarWidth);
    }
  }

  private onTouchCancel() {
    if (!this.isTouchTracking) {
      return;
    }
    this.isTouchTracking = false;

    if (!this.isDraggingFilters) {
      this.resetDragState();
      return;
    }
    const sidebarEl = this.filtersSidebar?.nativeElement;
    const sidebarWidth = sidebarEl?.offsetWidth || Math.min(360, window.innerWidth * 0.88);
    this.snapFilters(this.sidebarDragInitialState === 'open', sidebarWidth);
  }

  private snapFilters(toOpen: boolean, sidebarWidth: number) {
    const sidebarEl = this.filtersSidebar?.nativeElement;
    const backdropEl = this.filtersBackdrop?.nativeElement;

    if (!sidebarEl || !backdropEl) {
      this.filtersOpen.set(toOpen);
      this.resetDragState();
      return;
    }

    const transitionTiming = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)';
    const backdropTiming = 'opacity 240ms ease';

    sidebarEl.style.transition = transitionTiming;
    backdropEl.style.transition = backdropTiming;

    if (toOpen) {
      sidebarEl.style.transform = 'translateX(0)';
      backdropEl.style.visibility = 'visible';
      backdropEl.style.opacity = '1';
    } else {
      sidebarEl.style.transform = `translateX(${sidebarWidth}px)`;
      backdropEl.style.opacity = '0';
    }

    this.snapTimeout = setTimeout(() => {
      this.filtersOpen.set(toOpen);
      sidebarEl.style.transition = '';
      sidebarEl.style.transform = '';
      backdropEl.style.transition = '';
      backdropEl.style.opacity = '';
      backdropEl.style.visibility = '';
      backdropEl.style.pointerEvents = '';
      this.resetDragState();
      this.snapTimeout = null;
    }, 250);
  }

  private resetDragState() {
    this.isTouchTracking = false;
    this.isDraggingFilters = false;
    this.dragDirectionLocked = null;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchCurrentX = 0;
    this.sidebarDragInitialState = 'closed';
  }

  private clearSidebarInlineStyles() {
    if (this.snapTimeout) {
      clearTimeout(this.snapTimeout);
      this.snapTimeout = null;
    }
    this.resetDragState();
    const sidebarEl = this.filtersSidebar?.nativeElement;
    const backdropEl = this.filtersBackdrop?.nativeElement;
    if (sidebarEl) {
      sidebarEl.style.transition = '';
      sidebarEl.style.transform = '';
    }
    if (backdropEl) {
      backdropEl.style.transition = '';
      backdropEl.style.opacity = '';
      backdropEl.style.visibility = '';
      backdropEl.style.pointerEvents = '';
    }
  }

  toggleSelection(id: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.selectionService.toggle(id);
  }

  clearSelection() {
    this.selectionService.clear();
  }

  async onOpenOutfitModal() {
    const ids = this.selectionService.selectedIds();
    if (ids.length === 0) {
      return;
    }

    const dialogRef = this.dialog.open<OutfitDetailResponse | null>(OutfitSelectModalComponent, {
      data: {
        clothesIds: ids,
      },
    });

    const result = await firstValueFrom(dialogRef.closed);
    if (result) {
      this.selectionService.clear();
      this.toast.success(
        `Capi aggiunti all'abbinamento "${result.name}"`,
      );
    }
  }

  async onAddToWashing() {
    const ids = this.selectionService.selectedIds();
    if (ids.length === 0) {
      return;
    }
    const firstCard = document.querySelector<HTMLElement>(`[data-item-id="${ids[0]}"]`);
    void this.laundryService.animateFlyToNav(firstCard, 'washing', 'add');

    // Local-First: Update local items and local storage directly
    this.items.update((list) =>
      list.map((item) => (ids.includes(item.id) ? { ...item, isInWashing: true } : item)),
    );
    if (this.storage) {
      const cached = await this.storage.getLaundry();
      await this.storage.saveLaundry({
        ...cached,
        washing: [...new Set([...cached.washing, ...ids])],
      });
    }
    if (this.syncService) {
      for (const id of ids) {
        await this.syncService.queueLaundryChange('washing', id, 'create');
      }
    }
    void this.laundryService.refreshCounts('washing', 'add');
    this.selectionService.clear();
    this.toast.success(
      `${ids.length} ${ids.length === 1 ? 'capo aggiunto' : 'capi aggiunti'} alla lavatrice`,
    );
  }

  async onIron() {
    const ids = this.selectionService.selectedIds();
    if (ids.length === 0) {
      return;
    }
    const firstCard = document.querySelector<HTMLElement>(`[data-item-id="${ids[0]}"]`);
    void this.laundryService.animateFlyToNav(firstCard, 'ironing', 'add');

    // Local-First: Update local items and local storage directly
    this.items.update((list) =>
      list.map((item) => (ids.includes(item.id) ? { ...item, isInIroning: true } : item)),
    );
    if (this.storage) {
      const cached = await this.storage.getLaundry();
      await this.storage.saveLaundry({
        ...cached,
        ironing: [...new Set([...cached.ironing, ...ids])],
      });
    }
    if (this.syncService) {
      for (const id of ids) {
        await this.syncService.queueLaundryChange('ironing', id, 'create');
      }
    }
    void this.laundryService.refreshCounts('ironing', 'add');
    this.selectionService.clear();
    this.toast.success(
      `${ids.length} ${ids.length === 1 ? 'capo aggiunto' : 'capi aggiunti'} alla stiratura`,
    );
    void this.router.navigate(['/wardrobe/ironing']);
  }

  isActionPending(id: string): boolean {
    return this.pendingActionIds().has(id);
  }

  async toggleWashing(item: ClothesItem, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.isActionPending(item.id)) {
      return;
    }

    const action = item.isInWashing ? 'remove' : 'add';
    void this.laundryService.animateFlyToNav(event.currentTarget as HTMLElement, 'washing', action);

    // Local-First: Toggle directly in state and storage
    const nextState = !item.isInWashing;
    this.items.update((list) =>
      list.map((i) => (i.id === item.id ? { ...i, isInWashing: nextState } : i)),
    );
    if (this.storage) {
      const cached = await this.storage.getLaundry();
      const updatedList = nextState
        ? [...new Set([...cached.washing, item.id])]
        : cached.washing.filter((id) => id !== item.id);
      await this.storage.saveLaundry({ ...cached, washing: updatedList });
    }
    if (this.syncService) {
      await this.syncService.queueLaundryChange('washing', item.id, nextState ? 'create' : 'delete');
    }
    void this.laundryService.refreshCounts('washing', action);
    this.toast.success(nextState ? 'Capo aggiunto alla lavatrice' : 'Capo rimosso dalla lavatrice');
  }

  async toggleIroning(item: ClothesItem, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.isActionPending(item.id)) {
      return;
    }

    const action = item.isInIroning ? 'remove' : 'add';
    void this.laundryService.animateFlyToNav(event.currentTarget as HTMLElement, 'ironing', action);

    // Local-First: Toggle directly in state and storage
    const nextState = !item.isInIroning;
    this.items.update((list) =>
      list.map((i) => (i.id === item.id ? { ...i, isInIroning: nextState } : i)),
    );
    if (this.storage) {
      const cached = await this.storage.getLaundry();
      const updatedList = nextState
        ? [...new Set([...cached.ironing, item.id])]
        : cached.ironing.filter((id) => id !== item.id);
      await this.storage.saveLaundry({ ...cached, ironing: updatedList });
    }
    if (this.syncService) {
      await this.syncService.queueLaundryChange('ironing', item.id, nextState ? 'create' : 'delete');
    }
    void this.laundryService.refreshCounts('ironing', action);
    this.toast.success(nextState ? 'Capo aggiunto alla stiratura' : 'Capo rimosso dalla stiratura');
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

    if (this.storage) {
      const res = await this.storage.queryClothes(query);
      if (res.total > 0 || res.items.length > 0) {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
        return;
      }

      // If local storage is empty and online, run initial sync to pull everything from server
      if (this.syncService && !this.syncService.checkIsOffline()) {
        try {
          await this.syncService.sync(true);
          this.syncService.showStartupToastIfFirst();
          const refreshed = await this.storage.queryClothes(query);
          this.items.set(refreshed.items);
          this.total.set(refreshed.total);
          this.loading.set(false);
          return;
        } catch {
          // Graceful fallback
        }
      }

      this.items.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }

    this.loading.set(false);
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