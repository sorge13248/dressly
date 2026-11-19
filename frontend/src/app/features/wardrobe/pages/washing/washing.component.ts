import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { LaundryService } from '../../../../core/laundry.service';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { ToastService } from '../../../../core/toast.service';
import { WashingClothesItem } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { IroningIconComponent } from '../../../../shared/components/icons';
import { EmptyStateComponent } from '../../../../shared/components/empty-state';
import { CARE_LABELS, canIron, getIroningLabel, getIroningStatus } from '../../../../shared/utils/care.utils';

export interface WashingProgramDetergentGroup {
  key: string;
  program: {
    id?: string;
    name: string;
    temperature: number | null;
    spinSpeed: number | null;
  };
  detergent: {
    id?: string;
    name: string;
    description: string | null;
  } | null;
  title: string;
  subtitle: string;
  temperatureLabel: string | null;
  spinSpeedLabel: string | null;
  items: WashingClothesItem[];
}

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
  private readonly referenceStore = inject(ReferenceStoreService);
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
      const hasProgram = Boolean(this.resolveProgram(item));
      const hasTemp = this.parseManualTemperature(item) !== null;
      return !hasProgram && !hasTemp;
    }),
  );

  readonly programDetergentGroups = computed<WashingProgramDetergentGroup[]>(() => {
    const validItems = this.items().filter((item) => {
      const type = item.washingInstruction?.washType;
      if (type === 'do_not_wash' || type === 'hand_wash_only') {
        return false;
      }
      return Boolean(this.resolveProgram(item));
    });

    const groupsMap = new Map<
      string,
      {
        program: { id?: string; name: string; temperature: number | null; spinSpeed: number | null };
        detergent: { id?: string; name: string; description: string | null } | null;
        items: WashingClothesItem[];
      }
    >();

    for (const item of validItems) {
      const program = this.resolveProgram(item)!;
      const detergent = this.resolveDetergent(item);
      const progKey = program.id ?? program.name;
      const detKey = detergent ? (detergent.id ?? detergent.name) : '__none__';
      const key = `${progKey}:::${detKey}`;

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { program, detergent, items: [] });
      }
      groupsMap.get(key)!.items.push(item);
    }

    const groups = Array.from(groupsMap.entries()).map(([key, data]) => {
      const temp = data.program.temperature;
      const spin = data.program.spinSpeed;
      const tempLabel = temp === 0 ? 'A freddo' : temp !== null && temp !== undefined ? `${temp}°C` : null;
      const spinLabel = spin === 0 ? 'Senza centrifuga' : spin !== null && spin !== undefined ? `${spin} giri/min` : null;

      const title = data.detergent
        ? `${data.program.name} • ${data.detergent.name}`
        : `${data.program.name} • Senza detersivo`;

      const subtitleParts: string[] = [];
      if (tempLabel) subtitleParts.push(tempLabel);
      if (spinLabel) subtitleParts.push(spinLabel);
      if (data.detergent?.description) subtitleParts.push(data.detergent.description);
      const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' • ') : 'Programma lavatrice';

      return {
        key,
        program: data.program,
        detergent: data.detergent,
        title,
        subtitle,
        temperatureLabel: tempLabel,
        spinSpeedLabel: spinLabel,
        items: data.items,
      };
    });

    return groups.sort((a, b) => {
      const tempA = a.program.temperature ?? 999;
      const tempB = b.program.temperature ?? 999;
      if (tempA !== tempB) return tempA - tempB;

      const nameComp = a.program.name.localeCompare(b.program.name);
      if (nameComp !== 0) return nameComp;

      const detA = a.detergent?.name ?? '';
      const detB = b.detergent?.name ?? '';
      return detA.localeCompare(detB);
    });
  });

  readonly standaloneTemperatureGroups = computed<WashingTemperatureGroup[]>(() => {
    const validItems = this.items().filter((item) => {
      const type = item.washingInstruction?.washType;
      if (type === 'do_not_wash' || type === 'hand_wash_only') {
        return false;
      }
      if (this.resolveProgram(item)) {
        return false;
      }
      return this.parseManualTemperature(item) !== null;
    });

    const temps = Array.from(
      new Set(validItems.map((item) => this.parseManualTemperature(item)!)),
    ).sort((a, b) => a - b);

    return temps.map((temp) => ({
      temperature: temp,
      label: temp === 0 ? 'A freddo' : `${temp}°C`,
      title: temp === 0 ? 'Lavaggio a freddo' : `Temperatura ${temp}°C`,
      subtitle: this.getTempSubtitle(temp),
      items: validItems.filter((item) => this.parseManualTemperature(item) === temp),
    }));
  });

  readonly temperatureGroups = this.standaloneTemperatureGroups;

  readonly programDetergentItemCount = computed(() =>
    this.programDetergentGroups().reduce((acc, g) => acc + g.items.length, 0),
  );

  readonly standaloneTemperatureItemCount = computed(() =>
    this.standaloneTemperatureGroups().reduce((acc, g) => acc + g.items.length, 0),
  );

  readonly totalCount = computed(() => this.items().length);
  readonly getIroningStatus = getIroningStatus;
  readonly canIron = canIron;
  readonly getIroningLabel = getIroningLabel;
  readonly CARE_LABELS = CARE_LABELS;
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

    if (!this.canIron(item)) {
      return;
    }

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

  resolveProgram(
    item: WashingClothesItem,
  ): { id?: string; name: string; temperature: number | null; spinSpeed: number | null } | null {
    const wash = item.washingInstruction;
    if (!wash) return null;
    if (wash.washingProgram) return wash.washingProgram;
    if (wash.washingProgramId) {
      const found = this.referenceStore.washingPrograms().find((p) => p.id === wash.washingProgramId);
      if (found) {
        return {
          id: found.id,
          name: found.name,
          temperature: found.temperature ?? null,
          spinSpeed: found.spinSpeed ?? null,
        };
      }
    }
    return null;
  }

  resolveDetergent(
    item: WashingClothesItem,
  ): { id?: string; name: string; description: string | null } | null {
    const wash = item.washingInstruction;
    if (!wash) return null;
    if (wash.detergent) return wash.detergent;
    if (wash.detergentId) {
      const found = this.referenceStore.detergents().find((d) => d.id === wash.detergentId);
      if (found) {
        return {
          id: found.id,
          name: found.name,
          description: found.description ?? null,
        };
      }
    }
    return null;
  }

  parseManualTemperature(item: WashingClothesItem): number | null {
    const wash = item.washingInstruction;
    if (!wash) return null;
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

  parseTemperature(item: WashingClothesItem): number | null {
    const wash = item.washingInstruction;
    if (!wash) {
      return null;
    }
    const program = this.resolveProgram(item);
    const temp = wash.temperature ?? program?.temperature;
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

  hasColorLossRisk(item: WashingClothesItem): boolean {
    const risk = item.washingInstruction?.colorLossRisk;
    return risk === 1 || (risk as unknown) === true;
  }

  trackById(_: number, item: WashingClothesItem) {
    return item.id;
  }

  trackByTemp(_: number, group: WashingTemperatureGroup) {
    return group.temperature;
  }

  trackByProgramDetergent(_: number, group: WashingProgramDetergentGroup) {
    return group.key;
  }
}

