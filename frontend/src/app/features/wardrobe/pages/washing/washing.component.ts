import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { LaundryService } from '../../../../core/laundry.service';
import { ToastService } from '../../../../core/toast.service';
import { WashingClothesItem } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';

export interface WashingTemperatureGroup {
  temperature: number;
  label: string;
  subtitle: string;
  items: WashingClothesItem[];
}

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './washing.component.html',
  styleUrl: './washing.component.scss',
})
export class WashingPageComponent implements OnInit {
  private readonly api = inject(ApiService);
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
      label: `${temp}°C`,
      subtitle: this.getTempSubtitle(temp),
      items: validItems.filter((item) => this.parseTemperature(item) === temp),
    }));
  });

  readonly totalCount = computed(() => this.items().length);

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(this.api.getClothesForWashing());
      const loadedItems = response?.items ?? [];
      this.items.set(loadedItems);
      this.laundryService.setWashingCount(loadedItems.length);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Impossibile caricare i capi a lavare');
    } finally {
      this.loading.set(false);
    }
  }

  async onWashed(item: WashingClothesItem, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    try {
      await firstValueFrom(this.api.removeFromWashing(item.id));
      this.items.update((list) => list.filter((i) => i.id !== item.id));
      void this.laundryService.refreshCounts();
      this.toast.success('Capo segnato come lavato');
    } catch {
      this.toast.error('Errore durante la rimozione dalla lavatrice');
    }
  }

  async onWashedAndIron(item: WashingClothesItem, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    try {
      await firstValueFrom(this.api.moveWashingToIroning(item.id));
      this.items.update((list) => list.filter((i) => i.id !== item.id));
      void this.laundryService.refreshCounts();
      this.toast.success('Capo lavato e aggiunto ai capi da stirare');
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
      await firstValueFrom(this.api.clearWashing());
      this.items.set([]);
      this.laundryService.setWashingCount(0);
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
    if (!temp) {
      return null;
    }
    const num = Number(temp);
    if (Number.isNaN(num) || num <= 0) {
      return null;
    }
    return num;
  }

  getTempSubtitle(temp: number): string {
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

