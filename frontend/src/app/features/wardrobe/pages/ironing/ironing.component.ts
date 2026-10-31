import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { LaundryService } from '../../../../core/laundry.service';
import { ToastService } from '../../../../core/toast.service';
import { IroningClothesItem } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './ironing.component.html',
  styleUrl: './ironing.component.scss',
})
export class IroningPageComponent implements OnInit {
  private readonly api = inject(ApiService);
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

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(this.api.getClothesForIroning());
      const loadedItems = response?.items ?? [];
      this.items.set(loadedItems);
      this.laundryService.setIroningCount(loadedItems.length);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Impossibile caricare i capi da stirare');
    } finally {
      this.loading.set(false);
    }
  }

  async onIroned(item: IroningClothesItem, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    try {
      await firstValueFrom(this.api.removeFromIroning(item.id));
      this.items.update((list) => list.filter((i) => i.id !== item.id));
      void this.laundryService.refreshCounts();
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
      await firstValueFrom(this.api.clearIroning());
      this.items.set([]);
      this.laundryService.setIroningCount(0);
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

