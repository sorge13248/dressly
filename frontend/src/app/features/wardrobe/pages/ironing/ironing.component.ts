import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { LaundryService } from '../../../../core/laundry.service';
import { ToastService } from '../../../../core/toast.service';
import { IroningClothesItem } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, EmptyStateComponent],
  templateUrl: './ironing.component.html',
  styleUrl: './ironing.component.scss',
})
export class IroningPageComponent implements OnInit {
  private readonly storage = inject(OfflineStorageService);
  private readonly syncService = inject(SyncService);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly laundryService = inject(LaundryService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly items = signal<IroningClothesItem[]>([]);

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
  private initialLoaded = false;

  constructor() {
    effect(() => {
      this.syncService.dataUpdated();
      void this.load({ silent: this.initialLoaded });
    });
  }

  ngOnInit() {
    void this.load();
  }

  async load(options?: { silent?: boolean }) {
    const isSilent = options?.silent ?? this.initialLoaded;
    if (!isSilent) {
      this.loading.set(true);
    }
    this.error.set(null);

    try {
      const loadedItems = await this.storage.getClothesForIroning();
      this.items.set(loadedItems);
      this.laundryService.setIroningCount(loadedItems.length);
      this.initialLoaded = true;
    } catch (err) {
      if (!this.initialLoaded || !this.items().length) {
        this.error.set(err instanceof Error ? err.message : 'Impossibile caricare i capi da stirare');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onIroned(item: IroningClothesItem, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const targetEl = (event?.currentTarget as HTMLElement) || document.querySelector<HTMLElement>(`[data-ironing-id="${item.id}"]`);
    void this.laundryService.animateFlyToNav(targetEl, 'ironing', 'remove');

    try {
      await this.storage.removeFromIroning(item.id);
      await this.syncService.queueLaundryChange('ironing', item.id, 'delete');
      this.items.update((list) => list.filter((i) => i.id !== item.id));
      void this.laundryService.refreshCounts('ironing', 'remove');
      this.toast.success('Capo segnato come stirato');
    } catch {
      this.toast.error('Errore durante la rimozione dalla stiratura');
    }
  }

  async onClearList() {
    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Svuota lista stiratura',
        message: 'Vuoi davvero rimuovere tutti i vestiti dalla lista dei capi da stirare?',
        confirmLabel: 'Svuota',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) {
      return;
    }

    try {
      const laundry = await this.storage.getLaundry();
      await this.storage.clearIroning();
      if (this.syncService.queueLaundryChanges) {
        await this.syncService.queueLaundryChanges('ironing', laundry.ironing, 'delete');
      } else {
        for (const id of laundry.ironing) {
          await this.syncService.queueLaundryChange('ironing', id, 'delete');
        }
      }
      this.items.set([]);
      this.laundryService.updateIroningCount(0, 'slide-down');
      this.toast.success('Lista stiratura svuotata');
    } catch {
      this.toast.error('Errore durante lo svuotamento della lista');
    }
  }

  returnToWardrobe() {
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

