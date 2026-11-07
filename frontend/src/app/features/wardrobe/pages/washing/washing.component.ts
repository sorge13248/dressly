import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { LaundryService } from '../../../../core/laundry.service';
import { ToastService } from '../../../../core/toast.service';
import { WashingClothesItem } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { IroningIconComponent } from '../../../../shared/components/icons';
import { EmptyStateComponent } from '../../../../shared/components/empty-state';

export interface WashingTemperatureGroup {
  temperature: number;
  label: string;
  title: string;
  subtitle: string;
  items: WashingClothesItem[];
}

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, IroningIconComponent, EmptyStateComponent],
  templateUrl: './washing.component.html',
  styleUrl: './washing.component.scss',
})
export class WashingPageComponent implements OnInit {
  private readonly storage = inject(OfflineStorageService);
  private readonly syncService = inject(SyncService);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly laundryService = inject(LaundryService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly items = signal<WashingClothesItem[]>([]);

  readonly currentUrl = computed(() => this.router.url);

  readonly doNotWashItems = computed(() =>
    this.items().filter((item) => item.washingInstruction?.washType === 'do_not_wash'),
  );

  readonly handWashOnlyItems = computed(() =>
    this.items().filter((item) => item.washingInstruction?.washType === 'hand_wash_only'),
  );

  readonly missingInfoItems = computed(() =>
    this.items().filter((item) => {
      const type = item.washingInstruction?.washType;
      if (type === 'do_not_wash' || type === 'hand_wash_only') {
        return false;
      }
      return this.parseTemperature(item) === null;
    }),
  );

  readonly temperatureGroups = computed<WashingTemperatureGroup[]>(() => {
    const validItems = this.items().filter((item) => {
      const type = item.washingInstruction?.washType;
      if (type === 'do_not_wash' || type === 'hand_wash_only') {
        return false;
      }
      return this.parseTemperature(item) !== null;
    });

    const temps = Array.from(
      new Set(validItems.map((item) => this.parseTemperature(item)!)),
    ).sort((a, b) => a - b);

    return temps.map((temp) => ({
      temperature: temp,
      label: temp === 0 ? 'A freddo' : `${temp}°C`,
      title: temp === 0 ? 'Lavaggio a freddo' : `Temperatura ${temp}°C`,
      subtitle: this.getTempSubtitle(temp),
      items: validItems.filter((item) => this.parseTemperature(item) === temp),
    }));
  });

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
      const loadedItems = await this.storage.getClothesForWashing();
      this.items.set(loadedItems);
      this.laundryService.setWashingCount(loadedItems.length);
      this.initialLoaded = true;
    } catch (err) {
      if (!this.initialLoaded || !this.items().length) {
        this.error.set(err instanceof Error ? err.message : 'Impossibile caricare i capi a lavare');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onWashed(item: WashingClothesItem, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const targetEl = (event?.currentTarget as HTMLElement) || document.querySelector<HTMLElement>(`[data-washing-id="${item.id}"]`);
    void this.laundryService.animateFlyToNav(targetEl, 'washing', 'remove');

    const isCumulative = Boolean(item.isCumulative);
    const currentQty = item.washingQuantity ?? 1;

    try {
      await this.storage.removeFromWashing(item.id);
      await this.syncService.queueLaundryChange('washing', item.id, 'delete');

      if (isCumulative && currentQty > 1) {
        const nextQty = currentQty - 1;
        this.items.update((list) =>
          list.map((i) => (i.id === item.id ? { ...i, washingQuantity: nextQty } : i)),
        );
        this.toast.success(`1 capo segnato come lavato (ancora ${nextQty} in lavatrice)`);
      } else {
        this.items.update((list) => list.filter((i) => i.id !== item.id));
        this.toast.success('Capo segnato come lavato');
      }
      void this.laundryService.refreshCounts('washing', 'remove');
    } catch {
      this.toast.error('Errore durante la rimozione dalla lavatrice');
    }
  }

  async onWashedAll(item: WashingClothesItem, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const targetEl = (event?.currentTarget as HTMLElement) || document.querySelector<HTMLElement>(`[data-washing-id="${item.id}"]`);
    void this.laundryService.animateFlyToNav(targetEl, 'washing', 'remove');

    try {
      const currentQty = item.washingQuantity ?? 1;
      await this.storage.removeFromWashing(item.id, currentQty, true);
      for (let i = 0; i < currentQty; i++) {
        await this.syncService.queueLaundryChange('washing', item.id, 'delete');
      }
      this.items.update((list) => list.filter((i) => i.id !== item.id));
      void this.laundryService.refreshCounts('washing', 'remove');
      this.toast.success(`Tutti i ${currentQty} capi segnati come lavati`);
    } catch {
      this.toast.error('Errore durante la rimozione dalla lavatrice');
    }
  }

  async onWashedAndIron(item: WashingClothesItem, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const targetEl = (event?.currentTarget as HTMLElement) || document.querySelector<HTMLElement>(`[data-washing-id="${item.id}"]`);
    void this.laundryService.animateFlyToNav(targetEl, 'ironing', 'add');

    const isCumulative = Boolean(item.isCumulative);
    const currentQty = item.washingQuantity ?? 1;

    try {
      await this.storage.moveWashingToIroning(item.id);
      await this.syncService.queueLaundryChange('washing', item.id, 'delete');
      await this.syncService.queueLaundryChange('ironing', item.id, 'create');

      if (isCumulative && currentQty > 1) {
        const nextQty = currentQty - 1;
        this.items.update((list) =>
          list.map((i) => (i.id === item.id ? { ...i, washingQuantity: nextQty } : i)),
        );
        this.toast.success(`1 capo spostato nella stiratura (ancora ${nextQty} in lavatrice)`);
      } else {
        this.items.update((list) => list.filter((i) => i.id !== item.id));
        this.toast.success('Capo lavato e aggiunto ai capi da stirare');
      }
      void this.laundryService.refreshCounts('washing', 'remove');
      void this.laundryService.refreshCounts('ironing', 'add');
    } catch {
      this.toast.error('Errore durante lo spostamento in stiratura');
    }
  }

  async onClearList() {
    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Svuota lavatrice',
        message: 'Vuoi davvero rimuovere tutti i vestiti dalla lista dei capi da lavare?',
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
      await this.storage.clearWashing();
      if (this.syncService.queueLaundryChanges) {
        await this.syncService.queueLaundryChanges('washing', laundry.washing, 'delete');
      } else {
        for (const id of laundry.washing) {
          await this.syncService.queueLaundryChange('washing', id, 'delete');
        }
      }
      this.items.set([]);
      this.laundryService.updateWashingCount(0, 'slide-down');
      this.toast.success('Lavatrice svuotata');
    } catch {
      this.toast.error('Errore durante lo svuotamento della lavatrice');
    }
  }

  returnToWardrobe() {
    void this.router.navigate(['/wardrobe']);
  }

  parseTemperature(item: WashingClothesItem): number | null {
    const wash = item.washingInstruction;
    if (!wash) {
      return null;
    }
    const temp = wash.temperature;
    if (temp === null || temp === undefined || temp === '') {
      return null;
    }
    const num = Number(temp);
    if (Number.isNaN(num) || num < 0) {
      return null;
    }
    return num;
  }

  getTempSubtitle(temp: number): string {
    if (temp === 0) return 'Acqua fredda';
    if (temp <= 20) return 'Lavaggio a freddo • Delicatissimi';
    if (temp <= 30) return 'Max 30°C • Seta, sintetici, delicati';
    if (temp <= 40) return 'Max 40°C • Cotone, colorati, misti';
    if (temp <= 60) return 'Max 60°C • Bianchi, lenzuola, asciugamani';
    return `Max ${temp}°C • Alte temperature e igienizzazione`;
  }

  getPreferredLabel(item: WashingClothesItem): string {
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

  getAttachmentUrl(item: WashingClothesItem): string | null {
    if (!item.primaryAttachment) {
      return null;
    }
    const variant = item.primaryAttachment.previewPath ? '?variant=preview' : '';
    return `/api/clothes/${item.id}/attachments/${item.primaryAttachment.id}/file${variant}`;
  }

  trackById(_: number, item: WashingClothesItem) {
    return item.id;
  }

  trackByTemp(_: number, group: WashingTemperatureGroup) {
    return group.temperature;
  }
}

