import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CanDeactivateFn, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { ToastService } from '../../../../core/toast.service';
import { ClothesItem, SeasonItem } from '../../../../core/models';
import { ButtonComponent } from '../../../../shared/components/button';
import { ClothesCardComponent } from '../../components/clothes-card/clothes-card.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';

export interface SeasonalWizardStep {
  index: number;
  label: string;
  hint: string;
}

@Component({
  selector: 'app-seasonal-change-page',
  standalone: true,
  imports: [CommonModule, ButtonComponent, ClothesCardComponent],
  templateUrl: './seasonal-change.component.html',
  styleUrl: './seasonal-change.component.scss',
})
export class SeasonalChangePageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly storage = inject(OfflineStorageService, { optional: true });
  private readonly syncService = inject(SyncService, { optional: true });
  private readonly referenceStore = inject(ReferenceStoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly steps: SeasonalWizardStep[] = [
    { index: 1, label: 'Stagioni', hint: 'Uscente ed entrante' },
    { index: 2, label: 'In Deposito', hint: 'Capi da riporre' },
    { index: 3, label: 'Nell\'Armadio', hint: 'Capi da estrarre' },
    { index: 4, label: 'Decluttering', hint: 'Dona o elimina' },
    { index: 5, label: 'Conferma', hint: 'Riepilogo e applica' },
  ];

  readonly currentStep = signal<number>(1);
  readonly allClothes = signal<ClothesItem[]>([]);
  readonly loading = signal<boolean>(true);
  readonly isApplying = signal<boolean>(false);
  private readonly isSubmitted = signal<boolean>(false);

  // References
  readonly seasons = this.referenceStore.seasons;
  readonly rooms = this.referenceStore.rooms;
  readonly locations = this.referenceStore.locations;
  readonly locationsSorted = this.referenceStore.locationsSortedByRoomAndName;

  // Step 1: Seasons (multi-selection allowed)
  readonly selectedOutgoingSeasonIds = signal<Set<string>>(new Set());
  readonly selectedIncomingSeasonIds = signal<Set<string>>(new Set());

  // Step 2: Outgoing to Storage
  readonly selectedOutgoingIds = signal<Set<string>>(new Set());
  readonly destinationLocationId = signal<string>('');
  readonly sendOutgoingToWashing = signal<boolean>(false);

  // Step 3: Incoming to Wardrobe
  readonly selectedIncomingIds = signal<Set<string>>(new Set());
  readonly sendIncomingToIroning = signal<boolean>(false);

  // Step 4: Decluttering
  readonly selectedDeclutterIds = signal<Set<string>>(new Set());
  readonly declutterSearch = signal<string>('');

  // Computed candidate lists
  readonly outgoingCandidates = computed<ClothesItem[]>(() => {
    const outgoingSeasonIds = this.selectedOutgoingSeasonIds();
    const incomingSeasonIds = this.selectedIncomingSeasonIds();
    if (outgoingSeasonIds.size === 0) return [];
    return this.allClothes().filter(
      (c) =>
        (c.status || 'in_wardrobe') === 'in_wardrobe' &&
        c.seasons?.some((s) => outgoingSeasonIds.has(s.id)) &&
        !c.seasons?.some((s) => incomingSeasonIds.has(s.id)),
    );
  });

  readonly incomingCandidates = computed<ClothesItem[]>(() => {
    const seasonIds = this.selectedIncomingSeasonIds();
    if (seasonIds.size === 0) return [];
    return this.allClothes().filter(
      (c) => c.status === 'in_storage' && c.seasons?.some((s) => seasonIds.has(s.id)),
    );
  });

  readonly declutterCandidates = computed<ClothesItem[]>(() => {
    const search = this.declutterSearch().trim().toLowerCase();
    const outgoingSelected = this.selectedOutgoingIds();
    const incomingSelected = this.selectedIncomingIds();

    return this.allClothes().filter((c) => {
      // Don't show garments already queued for storage or wardrobe
      if (outgoingSelected.has(c.id) || incomingSelected.has(c.id)) {
        return false;
      }
      if (c.status === 'dismissed') {
        return false;
      }
      if (!search) return true;
      const name = c.name?.toLowerCase() || '';
      const type = c.type?.name?.toLowerCase() || '';
      const brand = c.brand?.name?.toLowerCase() || '';
      const code = c.code?.toLowerCase() || '';
      return name.includes(search) || type.includes(search) || brand.includes(search) || code.includes(search);
    });
  });

  readonly selectedOutgoingSeasons = computed(() =>
    this.seasons().filter((s) => this.selectedOutgoingSeasonIds().has(s.id)),
  );

  readonly selectedIncomingSeasons = computed(() =>
    this.seasons().filter((s) => this.selectedIncomingSeasonIds().has(s.id)),
  );

  readonly outgoingSeasonsLabel = computed(() => {
    const names = this.selectedOutgoingSeasons().map((s) => s.name);
    return names.length > 0 ? names.join(', ') : 'queste stagioni';
  });

  readonly incomingSeasonsLabel = computed(() => {
    const names = this.selectedIncomingSeasons().map((s) => s.name);
    return names.length > 0 ? names.join(', ') : 'queste stagioni';
  });

  readonly selectedDestinationLocation = computed(() =>
    this.locations().find((l) => l.id === this.destinationLocationId()),
  );

  readonly summaryStats = computed(() => ({
    outgoingCount: this.selectedOutgoingIds().size,
    incomingCount: this.selectedIncomingIds().size,
    declutterCount: this.selectedDeclutterIds().size,
    sendWashing: this.sendOutgoingToWashing(),
    sendIroning: this.sendIncomingToIroning(),
    locationName: this.selectedDestinationLocation()?.name || 'Nessuna specifica',
    roomName: this.selectedDestinationLocation()?.room?.name,
    outgoingSeasonsLabel: this.outgoingSeasonsLabel(),
    incomingSeasonsLabel: this.incomingSeasonsLabel(),
  }));

  async ngOnInit() {
    this.loading.set(true);
    try {
      if (this.storage) {
        const clothes = await this.storage.getAllClothes();
        this.allClothes.set(clothes);
      }
      await this.referenceStore.loadAll();
    } catch {
      this.toast.error('Errore durante il caricamento dei dati per il cambio di stagione');
    } finally {
      this.loading.set(false);
    }
  }

  toggleOutgoingSeason(season: SeasonItem) {
    const nextSet = new Set(this.selectedOutgoingSeasonIds());
    const isAdding = !nextSet.has(season.id);
    if (isAdding) {
      nextSet.add(season.id);
    } else {
      nextSet.delete(season.id);
    }
    this.selectedOutgoingSeasonIds.set(nextSet);

    // Auto-update candidate item selection
    this.selectedOutgoingIds.set(new Set(this.outgoingCandidates().map((c) => c.id)));
  }

  toggleIncomingSeason(season: SeasonItem) {
    const nextSet = new Set(this.selectedIncomingSeasonIds());
    const isAdding = !nextSet.has(season.id);
    if (isAdding) {
      nextSet.add(season.id);
    } else {
      nextSet.delete(season.id);
    }
    this.selectedIncomingSeasonIds.set(nextSet);

    // Auto-update incoming candidate item selection
    this.selectedIncomingIds.set(new Set(this.incomingCandidates().map((c) => c.id)));

    // Since incoming seasons affect outgoing candidates (excluding clothes matching incoming seasons),
    // update outgoing candidate selection as well
    this.selectedOutgoingIds.set(new Set(this.outgoingCandidates().map((c) => c.id)));
  }

  toggleOutgoingItem(id: string) {
    this.selectedOutgoingIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  selectAllOutgoing() {
    const all = this.outgoingCandidates().map((c) => c.id);
    this.selectedOutgoingIds.set(new Set(all));
  }

  deselectAllOutgoing() {
    this.selectedOutgoingIds.set(new Set());
  }

  toggleIncomingItem(id: string) {
    this.selectedIncomingIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  selectAllIncoming() {
    const all = this.incomingCandidates().map((c) => c.id);
    this.selectedIncomingIds.set(new Set(all));
  }

  deselectAllIncoming() {
    this.selectedIncomingIds.set(new Set());
  }

  toggleDeclutterItem(id: string) {
    this.selectedDeclutterIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  onDestinationLocationChange(event: Event) {
    const target = event.target as HTMLSelectElement | null;
    this.destinationLocationId.set(target?.value || '');
  }

  onDeclutterSearchChange(event: Event) {
    const target = event.target as HTMLInputElement | null;
    this.declutterSearch.set(target?.value || '');
  }

  toggleSendWashing() {
    this.sendOutgoingToWashing.update((v) => !v);
  }

  toggleSendIroning() {
    this.sendIncomingToIroning.update((v) => !v);
  }

  goToStep(step: number) {
    if (step < 1 || step > this.steps.length) return;
    if (step > this.currentStep() && !this.canProceed()) {
      return;
    }
    this.currentStep.set(step);
  }

  nextStep() {
    if (this.currentStep() < this.steps.length && this.canProceed()) {
      this.currentStep.update((s) => s + 1);
    }
  }

  prevStep() {
    if (this.currentStep() > 1) {
      this.currentStep.update((s) => s - 1);
    }
  }

  canProceed(): boolean {
    if (this.currentStep() === 1) {
      // Must select at least one season (either outgoing or incoming)
      return this.selectedOutgoingSeasonIds().size > 0 || this.selectedIncomingSeasonIds().size > 0;
    }
    return true;
  }

  hasUnsavedChanges(): boolean {
    if (this.isSubmitted()) {
      return false;
    }
    return (
      this.selectedOutgoingSeasonIds().size > 0 ||
      this.selectedIncomingSeasonIds().size > 0 ||
      this.selectedOutgoingIds().size > 0 ||
      this.selectedIncomingIds().size > 0 ||
      this.selectedDeclutterIds().size > 0 ||
      Boolean(this.destinationLocationId()) ||
      this.sendOutgoingToWashing() ||
      this.sendIncomingToIroning() ||
      this.currentStep() > 1
    );
  }

  async confirmDiscardChanges(): Promise<boolean> {
    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Modifiche non salvate',
        message: 'Ci sono selezioni o modifiche non salvate nel cambio di stagione. Sei sicuro di voler uscire e annullare la procedura?',
        confirmLabel: 'Esci',
        cancelLabel: 'Annulla',
        confirmVariant: 'danger',
      },
    });
    const confirmed = await firstValueFrom(dialogRef.closed);
    return Boolean(confirmed);
  }

  async canDeactivate(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    return this.confirmDiscardChanges();
  }

  cancelOrClose() {
    void this.router.navigate(['/wardrobe']);
  }

  getItemLabel(item: ClothesItem): string {
    if (item.name?.trim()) return item.name.trim();
    const type = item.type?.name?.trim() || '';
    const color = item.colors?.[0]?.name?.trim() || '';
    return type && color ? `${type} ${color}` : type || color || 'Capo senza nome';
  }

  async applyRotation() {
    if (this.isApplying()) return;
    this.isApplying.set(true);

    const outgoingIds = Array.from(this.selectedOutgoingIds());
    const incomingIds = Array.from(this.selectedIncomingIds());
    const declutterIds = Array.from(this.selectedDeclutterIds());
    const destLocId = this.destinationLocationId() || null;
    const destLoc = destLocId ? this.locations().find((l) => l.id === destLocId) : null;
    const isOffline = Boolean(this.syncService?.checkIsOffline());

    try {
      // 1. Move outgoing to storage
      if (outgoingIds.length > 0) {
        if (!isOffline) {
          await this.api.bulkUpdateStatus(outgoingIds, 'in_storage', destLocId);
        }
        if (this.storage) {
          const toSave: ClothesItem[] = [];
          for (const id of outgoingIds) {
            const existing = await this.storage.getClothes(id);
            if (existing) {
              toSave.push({
                ...existing,
                status: 'in_storage',
                locationId: destLocId,
                location: destLoc || undefined,
              });
            }
          }
          if (toSave.length > 0) {
            await this.storage.saveClothes(toSave);
          }
        }
        if (this.syncService) {
          for (const id of outgoingIds) {
            await this.syncService.queueClothesChange(id, 'update', {
              status: 'in_storage',
              location_id: destLocId,
            });
          }
        }

        // Send to washing if requested
        if (this.sendOutgoingToWashing()) {
          if (!isOffline) {
            await this.api.addToWashing(outgoingIds);
          }
          if (this.storage) {
            await this.storage.addToWashing(outgoingIds);
          }
          if (this.syncService) {
            await this.syncService.queueLaundryChanges('washing', outgoingIds, 'create');
          }
        }
      }

      // 2. Move incoming to wardrobe
      if (incomingIds.length > 0) {
        if (!isOffline) {
          await this.api.bulkUpdateStatus(incomingIds, 'in_wardrobe', null);
        }
        if (this.storage) {
          const toSave: ClothesItem[] = [];
          for (const id of incomingIds) {
            const existing = await this.storage.getClothes(id);
            if (existing) {
              toSave.push({
                ...existing,
                status: 'in_wardrobe',
                locationId: null,
                location: undefined,
              });
            }
          }
          if (toSave.length > 0) {
            await this.storage.saveClothes(toSave);
          }
        }
        if (this.syncService) {
          for (const id of incomingIds) {
            await this.syncService.queueClothesChange(id, 'update', {
              status: 'in_wardrobe',
              location_id: null,
            });
          }
        }

        // Send to ironing if requested
        if (this.sendIncomingToIroning()) {
          if (!isOffline) {
            await this.api.addToIroning(incomingIds);
          }
          if (this.storage) {
            await this.storage.addToIroning(incomingIds);
          }
          if (this.syncService) {
            await this.syncService.queueLaundryChanges('ironing', incomingIds, 'create');
          }
        }
      }

      // 3. Apply decluttering
      if (declutterIds.length > 0) {
        if (!isOffline) {
          await this.api.bulkUpdateStatus(declutterIds, 'dismissed', null);
        }
        if (this.storage) {
          const toSave: ClothesItem[] = [];
          for (const id of declutterIds) {
            const existing = await this.storage.getClothes(id);
            if (existing) {
              toSave.push({
                ...existing,
                status: 'dismissed',
                locationId: null,
                location: undefined,
              });
            }
          }
          if (toSave.length > 0) {
            await this.storage.saveClothes(toSave);
          }
        }
        if (this.syncService) {
          for (const id of declutterIds) {
            await this.syncService.queueClothesChange(id, 'update', {
              status: 'dismissed',
              location_id: null,
            });
          }
        }
      }

      this.isSubmitted.set(true);
      this.toast.success('Cambio di stagione completato con successo! 🎉');
      void this.router.navigate(['/wardrobe']);
    } catch {
      this.toast.error('Si è verificato un errore durante l\'applicazione del cambio di stagione.');
    } finally {
      this.isApplying.set(false);
    }
  }
}

export const canDeactivateSeasonalChange: CanDeactivateFn<SeasonalChangePageComponent> = (component) => {
  return component.canDeactivate();
};
