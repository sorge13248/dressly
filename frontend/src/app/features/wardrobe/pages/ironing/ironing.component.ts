import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { IroningClothesItem } from '../../../../core/models';
import { WardrobeSelectionService } from '../../services/wardrobe-selection.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './ironing.component.html',
  styleUrl: './ironing.component.scss',
})
export class IroningPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly selectionService = inject(WardrobeSelectionService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly items = signal<IroningClothesItem[]>([]);
  readonly ids = signal<string[]>([]);

  readonly currentUrl = computed(() => this.router.url);

  readonly missingInfoItems = computed(() =>
    this.items().filter((item) => this.parseDots(item) === null),
  );

  readonly oneDotItems = computed(() =>
    this.items().filter((item) => this.parseDots(item) === 1),
  );

  readonly twoDotsItems = computed(() =>
    this.items().filter((item) => this.parseDots(item) === 2),
  );

  readonly threeDotsItems = computed(() =>
    this.items().filter((item) => this.parseDots(item) === 3),
  );

  readonly totalCount = computed(() => this.items().length);

  ngOnInit() {
    this.route.queryParamMap.subscribe((params) => {
      const rawIds = params.get('ids') ?? '';
      const parsedIds = rawIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      this.ids.set(parsedIds);
      void this.load(parsedIds);
    });
  }

  async load(ids: string[]) {
    if (ids.length === 0) {
      this.items.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(this.api.getClothesForIroning(ids));
      const loadedItems = response?.items ?? [];
      this.items.set(loadedItems);
      if (loadedItems.length > 0) {
        this.selectionService.selectMany(loadedItems.map((item) => item.id));
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Impossibile caricare i capi da stirare');
    } finally {
      this.loading.set(false);
    }
  }

  returnToWardrobe() {
    const validIds = this.items().length > 0 ? this.items().map((item) => item.id) : this.ids();
    if (validIds.length > 0) {
      this.selectionService.clear();
      this.selectionService.selectMany(validIds);
    }
    void this.router.navigate(['/wardrobe']);
  }

  parseDots(item: IroningClothesItem): number | null {
    const iron = item.ironingInstruction;
    if (!iron || iron.ironType === 'no') {
      return null;
    }

    const temp = iron.temperature;
    if (!temp) {
      return null;
    }

    const num = Number(temp);
    if (Number.isNaN(num) || num <= 0) {
      return null;
    }

    if (num <= 1) return 1;
    if (num === 2) return 2;
    if (num === 3) return 3;
    if (num <= 110) return 1;
    if (num <= 150) return 2;
    return 3;
  }

  getPreferredLabel(item: IroningClothesItem): string {
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

  getAttachmentUrl(item: IroningClothesItem): string | null {
    if (!item.primaryAttachment) {
      return null;
    }
    const variant = item.primaryAttachment.previewPath ? '?variant=preview' : '';
    return `/api/clothes/${item.id}/attachments/${item.primaryAttachment.id}/file${variant}`;
  }

  trackById(_: number, item: IroningClothesItem) {
    return item.id;
  }
}

