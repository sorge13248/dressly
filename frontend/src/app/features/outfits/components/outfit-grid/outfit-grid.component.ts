import { CommonModule } from '@angular/common';
import { Component, OnInit, effect, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { ToastService } from '../../../../core/toast.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { AttachmentItem, ClothesItem, OutfitDetailResponse, OutfitItem } from '../../../../core/models';
import { CreateNameModalComponent } from '../../../../shared/components/create-name-modal/create-name-modal.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';

@Component({
  selector: 'app-outfit-grid',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './outfit-grid.component.html',
  styleUrl: './outfit-grid.component.scss',
})
export class OutfitGridComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly storage = inject(OfflineStorageService, { optional: true });
  private readonly syncService = inject(SyncService, { optional: true });

  readonly mode = input<'page' | 'modal'>('page');
  readonly selectedClothesIds = input<string[]>([]);

  readonly outfitSelected = output<OutfitDetailResponse>();
  readonly outfitCreated = output<OutfitDetailResponse>();

  readonly outfits = signal<OutfitItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly actionBusy = signal(false);

  constructor() {
    effect(() => {
      this.syncService?.dataUpdated();
      void this.loadOutfits();
    });
  }

  ngOnInit() {
    void this.loadOutfits();
  }

  async loadOutfits() {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.storage) {
        const cached = await this.storage.getAllOutfits();
        this.outfits.set(cached);
        return;
      }

      const items = await firstValueFrom(this.api.listOutfits());
      this.outfits.set(items);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Errore nel caricamento degli abbinamenti');
    } finally {
      this.loading.set(false);
    }
  }

  getAttachmentUrl(clothId: string, attachment: AttachmentItem | null | undefined): string {
    if (!attachment) {
      return '';
    }
    const variant = attachment.previewPath ? '?variant=preview' : '';
    return `/api/clothes/${clothId}/attachments/${attachment.id}/file${variant}`;
  }

  async openCreateOutfitModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Nuovo abbinamento',
        description: 'Inserisci il nome per il nuovo abbinamento.',
        label: 'Nome abbinamento',
        placeholder: 'Es. Completo estivo',
        requiredMessage: 'Inserisci il nome dell\'abbinamento',
        confirmLabel: 'Crea',
      },
    });

    const name = await firstValueFrom(dialogRef.closed);
    if (!name) {
      return;
    }

    this.actionBusy.set(true);
    try {
      const clothesIds = this.mode() === 'modal' ? this.selectedClothesIds() : [];
      let created: OutfitDetailResponse;

      if (!this.syncService?.checkIsOffline()) {
        try {
          created = await firstValueFrom(this.api.createOutfit({ name, clothesIds }));
        } catch (apiErr) {
          if (this.syncService?.isOfflineError(apiErr)) {
            created = await this.createOfflineOutfit(name, clothesIds);
          } else {
            throw apiErr;
          }
        }
      } else {
        created = await this.createOfflineOutfit(name, clothesIds);
      }

      if (this.storage) {
        await this.storage.saveOutfit(created);
      }

      if (this.mode() === 'modal') {
        this.outfitCreated.emit(created);
      } else {
        this.toast.success(`Abbinamento "${created.name}" creato`);
        await this.loadOutfits();
        void this.router.navigate(['/outfits', created.id]);
      }
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Impossibile creare l\'abbinamento');
    } finally {
      this.actionBusy.set(false);
    }
  }

  private async createOfflineOutfit(name: string, clothesIds: string[]): Promise<OutfitDetailResponse> {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `outfit_${Date.now()}_${Math.random()}`;
    const now = new Date().toISOString();
    let clothes: ClothesItem[] = [];
    if (this.storage && clothesIds.length > 0) {
      const allClothes = await this.storage.getAllClothes();
      clothes = allClothes.filter((c) => clothesIds.includes(c.id));
    }
    const newOutfit: OutfitDetailResponse = {
      id,
      name,
      clothesCount: clothes.length,
      clothes,
      createdAt: now,
      updatedAt: now,
    };
    if (this.syncService) {
      await this.syncService.queueOutfitChange(id, 'create', { name, clothesIds });
    }
    return newOutfit;
  }

  async handleCardClick(outfit: OutfitItem) {
    if (this.actionBusy()) {
      return;
    }

    if (this.mode() === 'modal') {
      const idsToAdd = this.selectedClothesIds();
      if (idsToAdd.length === 0) {
        return;
      }

      this.actionBusy.set(true);
      try {
        let updated: OutfitDetailResponse;
        if (!this.syncService?.checkIsOffline()) {
          try {
            updated = await firstValueFrom(this.api.addClothesToOutfit(outfit.id, idsToAdd));
          } catch (apiErr) {
            if (this.syncService?.isOfflineError(apiErr)) {
              updated = await this.addClothesOffline(outfit, idsToAdd);
            } else {
              throw apiErr;
            }
          }
        } else {
          updated = await this.addClothesOffline(outfit, idsToAdd);
        }

        if (this.storage) {
          await this.storage.saveOutfit(updated);
        }
        this.outfitSelected.emit(updated);
      } catch (err) {
        this.toast.error(err instanceof Error ? err.message : 'Impossibile aggiungere i capi');
      } finally {
        this.actionBusy.set(false);
      }
    } else {
      void this.router.navigate(['/outfits', outfit.id]);
    }
  }

  private async addClothesOffline(outfit: OutfitItem, idsToAdd: string[]): Promise<OutfitDetailResponse> {
    const now = new Date().toISOString();
    let allClothes: ClothesItem[] = [];
    if (this.storage) {
      allClothes = await this.storage.getAllClothes();
    }
    const currentClothes = (outfit.clothes ?? []) as unknown as ClothesItem[];
    const existingIds = new Set(currentClothes.map((c) => c.id));
    const newClothes = allClothes.filter((c) => idsToAdd.includes(c.id) && !existingIds.has(c.id));
    const combinedClothes = [...currentClothes, ...newClothes];
    const combinedIds = combinedClothes.map((c) => c.id);

    const updated: OutfitDetailResponse = {
      id: outfit.id,
      name: outfit.name,
      clothesCount: combinedClothes.length,
      clothes: combinedClothes,
      createdAt: outfit.createdAt || now,
      updatedAt: now,
    };
    if (this.syncService) {
      await this.syncService.queueOutfitChange(outfit.id, 'update', { clothesIds: combinedIds });
    }
    return updated;
  }

  async deleteOutfit(outfit: OutfitItem, event: Event) {
    event.stopPropagation();
    if (this.actionBusy()) {
      return;
    }

    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Elimina abbinamento',
        message: `Vuoi davvero eliminare l'abbinamento "${outfit.name}"? I vestiti non verranno eliminati dal guardaroba.`,
        confirmLabel: 'Elimina',
        cancelLabel: 'Annulla',
        danger: true,
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) {
      return;
    }

    this.actionBusy.set(true);
    try {
      this.outfits.update((list) => list.filter((o) => o.id !== outfit.id));
      if (this.storage) {
        await this.storage.removeOutfit(outfit.id);
      }
      if (this.syncService) {
        await this.syncService.queueOutfitChange(outfit.id, 'delete');
      }
      if (!this.syncService?.checkIsOffline()) {
        try {
          await firstValueFrom(this.api.deleteOutfit(outfit.id));
        } catch {
          // Already queued in syncService
        }
      }
      this.toast.success(`Abbinamento "${outfit.name}" eliminato`);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Impossibile eliminare l\'abbinamento');
    } finally {
      this.actionBusy.set(false);
    }
  }
}
