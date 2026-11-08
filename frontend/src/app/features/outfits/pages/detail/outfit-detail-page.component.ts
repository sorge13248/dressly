import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { ToastService } from '../../../../core/toast.service';
import { LaundryService } from '../../../../core/laundry.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { AttachmentItem, CanvasItemLayout, ClothesItem, OutfitDetailResponse } from '../../../../core/models';
import { ButtonComponent } from '../../../../shared/components/button';
import { WashingIconComponent } from '../../../../shared/components/icons/washing-icon.component';
import { IroningIconComponent } from '../../../../shared/components/icons/ironing-icon.component';
import { CreateNameModalComponent } from '../../../../shared/components/create-name-modal/create-name-modal.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { ContextSelectorComponent } from '../../../../shared/components/context-selector/context-selector.component';
import { ClothesCardComponent } from '../../../wardrobe/components/clothes-card/clothes-card.component';
import { WardrobePhotoLightboxModalComponent } from '../../../wardrobe/components/photo-lightbox-modal/photo-lightbox-modal.component';
import { OutfitCanvasComponent } from '../../components/outfit-canvas/outfit-canvas.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state';

@Component({
  selector: 'app-outfit-detail-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonComponent,
    WashingIconComponent,
    IroningIconComponent,
    ClothesCardComponent,
    ContextSelectorComponent,
    OutfitCanvasComponent,
    EmptyStateComponent,
  ],
  templateUrl: './outfit-detail-page.component.html',
  styleUrl: './outfit-detail-page.component.scss',
})
export class OutfitDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly storage = inject(OfflineStorageService, { optional: true });
  private readonly syncService = inject(SyncService, { optional: true });
  readonly laundryService = inject(LaundryService);

  @ViewChild('photoFileInput') photoFileInput?: ElementRef<HTMLInputElement>;

  readonly outfit = signal<OutfitDetailResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly actionBusy = signal(false);

  readonly storageWarning = computed(() => {
    const o = this.outfit();
    if (!o?.clothes || o.clothes.length === 0) return null;
    const inStorage = o.clothes.filter((c) => c.status === 'in_storage');
    if (inStorage.length === 0) return null;
    if (inStorage.length === 1) {
      const cloth = inStorage[0];
      const loc = cloth.location?.name ? `: ${cloth.location.name}` : '';
      return `1 capo di questo abbinamento è attualmente in deposito${loc}.`;
    }
    return `${inStorage.length} capi di questo abbinamento sono attualmente in deposito.`;
  });

  // Edit details mode
  readonly isEditingDetails = signal(false);
  readonly editName = signal('');
  readonly editDescription = signal('');
  readonly editSeasonIds = signal<string[]>([]);
  readonly editTemperatureIds = signal<string[]>([]);
  readonly editUseCaseIds = signal<string[]>([]);
  readonly isSavingDetails = signal(false);

  // Photo upload
  readonly uploadingPhoto = signal(false);

  // Batch laundry / ironing actions
  readonly batchActionBusy = signal(false);
  private initialLoaded = false;

  constructor() {
    const sync = this.syncService;
    if (sync) {
      effect(() => {
        sync.dataUpdated();
        const id = this.route.snapshot.paramMap.get('id');
        if (id && this.initialLoaded) {
          void this.loadOutfit({ silent: true });
        }
      });
    }
  }

  readonly clothesInWashingCount = computed(() => {
    return this.outfit()?.clothes.filter((c) => c.isInWashing).length ?? 0;
  });

  readonly allClothesInWashing = computed(() => {
    const list = this.outfit()?.clothes ?? [];
    return list.length > 0 && list.every((c) => c.isInWashing);
  });

  readonly clothesInIroningCount = computed(() => {
    return this.outfit()?.clothes.filter((c) => c.isInIroning).length ?? 0;
  });

  readonly allClothesInIroning = computed(() => {
    const list = this.outfit()?.clothes ?? [];
    return list.length > 0 && list.every((c) => c.isInIroning);
  });

  ngOnInit() {
    void this.loadOutfit();
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  async loadOutfit(options?: { silent?: boolean }) {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Identificativo abbinamento mancante');
      this.loading.set(false);
      return;
    }

    const isSilent = options?.silent ?? (this.initialLoaded && this.outfit() !== null);
    if (!isSilent) {
      this.loading.set(true);
    }
    this.error.set(null);

    // 1. Check local offline storage
    if (this.storage) {
      const cached = await this.storage.getOutfit(id);
      if (cached) {
        let fullClothes: ClothesItem[] = [];
        const allClothes = await this.storage.getAllClothes();
        const laundry = await this.storage.getLaundry();
        const washingSet = new Set(laundry.washing);
        const ironingSet = new Set(laundry.ironing);

        if (Array.isArray(cached.clothes)) {
          const cachedIds = new Set(cached.clothes.map((c) => c.id));
          fullClothes = allClothes
            .filter((c) => cachedIds.has(c.id))
            .map((c) => ({
              ...c,
              isInWashing: washingSet.has(c.id),
              isInIroning: ironingSet.has(c.id),
            }));
        }

        const resolvedOutfit: OutfitDetailResponse = {
          id: cached.id,
          name: cached.name,
          description: cached.description ?? null,
          canvasLayout: cached.canvasLayout ?? null,
          seasons: cached.seasons ?? [],
          temperatures: cached.temperatures ?? [],
          useCases: cached.useCases ?? [],
          attachments: cached.attachments ?? [],
          clothesCount: fullClothes.length,
          clothes: fullClothes,
          createdAt: cached.createdAt,
          updatedAt: cached.updatedAt,
        };
        this.outfit.set(resolvedOutfit);
        this.initialLoaded = true;
        this.loading.set(false);

        if (this.syncService && !this.syncService.checkIsOffline() && !isSilent) {
          void this.refreshFromServerSilently(id);
        }
        return;
      }
    }

    // 2. Fetch from server if online
    try {
      const data = await firstValueFrom(this.api.getOutfit(id));
      this.outfit.set(data);
      this.initialLoaded = true;
      if (this.storage) {
        await this.storage.saveOutfit(data);
      }
    } catch (err) {
      if (!this.outfit()) {
        this.error.set(err instanceof Error ? err.message : "Impossibile caricare l'abbinamento");
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshFromServerSilently(id: string) {
    try {
      const data = await firstValueFrom(this.api.getOutfit(id));
      this.outfit.set(data);
      if (this.storage) {
        await this.storage.saveOutfit(data);
      }
    } catch {
      // Silent error in background
    }
  }

  // --- Edit Details Modal / Form ---

  openEditDetails() {
    const o = this.outfit();
    if (!o) return;

    this.editName.set(o.name);
    this.editDescription.set(o.description || '');
    this.editSeasonIds.set((o.seasons || []).map((s) => s.id));
    this.editTemperatureIds.set((o.temperatures || []).map((t) => t.id));
    this.editUseCaseIds.set((o.useCases || []).map((u) => u.id));
    this.isEditingDetails.set(true);
  }

  cancelEditDetails() {
    this.isEditingDetails.set(false);
  }

  async saveEditDetails() {
    if (this.isSavingDetails()) return;
    const o = this.outfit();
    if (!o) return;

    const trimmedName = this.editName().trim();
    if (!trimmedName) {
      this.toast.error("Il nome dell'abbinamento è obbligatorio");
      return;
    }

    this.isSavingDetails.set(true);
    try {
      const payload = {
        name: trimmedName,
        description: this.editDescription().trim() || null,
        season_ids: this.editSeasonIds(),
        temperature_ids: this.editTemperatureIds(),
        use_case_ids: this.editUseCaseIds(),
      };

      const updated = await firstValueFrom(this.api.updateOutfit(o.id, payload));
      this.outfit.set(updated);

      if (this.storage) {
        await this.storage.saveOutfit(updated);
      }
      if (this.syncService) {
        await this.syncService.queueOutfitChange(o.id, 'update', payload);
      }

      this.isEditingDetails.set(false);
      this.toast.success('Dettagli abbinamento aggiornati con successo');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Impossibile aggiornare i dettagli');
    } finally {
      this.isSavingDetails.set(false);
    }
  }

  // --- Canvas layout update ---

  async onLayoutSaved(layout: Record<string, CanvasItemLayout>) {
    const o = this.outfit();
    if (!o) return;

    const updated: OutfitDetailResponse = {
      ...o,
      canvasLayout: layout,
      updatedAt: new Date().toISOString(),
    };
    this.outfit.set(updated);

    if (this.storage) {
      await this.storage.saveOutfit(updated);
    }
    if (this.syncService) {
      await this.syncService.queueOutfitChange(o.id, 'update', { canvasLayout: layout });
    }
  }

  // --- Outfit Photo Management ---

  triggerPhotoUpload() {
    this.photoFileInput?.nativeElement.click();
  }

  async onPhotoFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const o = this.outfit();
    if (!o) return;

    this.uploadingPhoto.set(true);
    try {
      const attachment = await firstValueFrom(this.api.uploadOutfitAttachment(o.id, file));
      const currentAttachments = o.attachments || [];
      const updatedAttachments = [...currentAttachments, attachment];

      const updated: OutfitDetailResponse = {
        ...o,
        attachments: updatedAttachments,
        updatedAt: new Date().toISOString(),
      };
      this.outfit.set(updated);

      if (this.storage) {
        await this.storage.saveOutfit(updated);
      }

      this.toast.success('Foto caricata con successo');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Impossibile caricare la foto');
    } finally {
      this.uploadingPhoto.set(false);
      input.value = '';
    }
  }

  async deleteOutfitPhoto(attachment: AttachmentItem, event: Event) {
    event.stopPropagation();
    const o = this.outfit();
    if (!o) return;

    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Elimina foto',
        message: 'Vuoi davvero eliminare questa foto dell\'abbinamento?',
        confirmLabel: 'Elimina',
        cancelLabel: 'Annulla',
        danger: true,
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) return;

    this.actionBusy.set(true);
    try {
      await firstValueFrom(this.api.deleteOutfitAttachment(o.id, attachment.id));
      const updatedAttachments = (o.attachments || []).filter((a) => a.id !== attachment.id);
      const updated: OutfitDetailResponse = {
        ...o,
        attachments: updatedAttachments,
        updatedAt: new Date().toISOString(),
      };
      this.outfit.set(updated);

      if (this.storage) {
        await this.storage.saveOutfit(updated);
      }

      this.toast.success('Foto eliminata con successo');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Impossibile eliminare la foto');
    } finally {
      this.actionBusy.set(false);
    }
  }

  openPhotoLightbox(attachment: AttachmentItem) {
    const o = this.outfit();
    if (!o) return;

    const src = this.api.getOutfitAttachmentUrl(o.id, attachment, 'original');
    this.dialog.open(WardrobePhotoLightboxModalComponent, {
      data: {
        src,
        alt: attachment.originalName || 'Foto abbinamento',
        title: o.name,
      },
    });
  }

  getOutfitPhotoUrl(attachment: AttachmentItem): string {
    const o = this.outfit();
    if (!o) return '';
    return this.api.getOutfitAttachmentUrl(o.id, attachment, 'preview');
  }

  // --- Clothes management ---

  async removeCloth(item: ClothesItem, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    const current = this.outfit();
    if (!current) return;

    const label = item.name?.trim() || item.fullTitle || item.type?.name || 'questo capo';

    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Rimuovi dall\'abbinamento',
        message: `Vuoi rimuovere "${label}" da questo abbinamento? Il capo rimarrà comunque nel tuo guardaroba.`,
        confirmLabel: 'Rimuovi',
        cancelLabel: 'Annulla',
        danger: true,
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) return;

    this.actionBusy.set(true);
    try {
      const remainingClothes = current.clothes.filter((c) => c.id !== item.id);
      const remainingIds = remainingClothes.map((c) => c.id);
      const updatedOutfit: OutfitDetailResponse = {
        ...current,
        clothesCount: remainingClothes.length,
        clothes: remainingClothes,
        updatedAt: new Date().toISOString(),
      };

      this.outfit.set(updatedOutfit);

      if (this.storage) {
        await this.storage.saveOutfit(updatedOutfit);
      }

      if (this.syncService) {
        await this.syncService.queueOutfitChange(current.id, 'update', { clothesIds: remainingIds });
      }

      if (!this.syncService?.checkIsOffline()) {
        try {
          await firstValueFrom(this.api.removeClothesFromOutfit(current.id, item.id));
        } catch (apiErr) {
          if (!this.syncService?.isOfflineError(apiErr)) {
            throw apiErr;
          }
        }
      }

      this.toast.success(`"${label}" rimosso dall'abbinamento`);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Impossibile rimuovere il capo');
    } finally {
      this.actionBusy.set(false);
    }
  }

  async toggleWashing(item: ClothesItem, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    const action = item.isInWashing ? 'remove' : 'add';
    void this.laundryService.animateFlyToNav(event.currentTarget as HTMLElement, 'washing', action);

    const nextState = !item.isInWashing;
    this.outfit.update((o) => {
      if (!o) return null;
      return {
        ...o,
        clothes: o.clothes.map((c) => (c.id === item.id ? { ...c, isInWashing: nextState } : c)),
      };
    });

    if (this.storage) {
      const cached = await this.storage.getLaundry();
      const updatedList = nextState
        ? [...new Set([...cached.washing, item.id])]
        : cached.washing.filter((id) => id !== item.id);
      await this.storage.saveLaundry({ ...cached, washing: updatedList });

      const curr = this.outfit();
      if (curr) {
        await this.storage.saveOutfit(curr);
      }
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

    const action = item.isInIroning ? 'remove' : 'add';
    void this.laundryService.animateFlyToNav(event.currentTarget as HTMLElement, 'ironing', action);

    const nextState = !item.isInIroning;
    this.outfit.update((o) => {
      if (!o) return null;
      return {
        ...o,
        clothes: o.clothes.map((c) => (c.id === item.id ? { ...c, isInIroning: nextState } : c)),
      };
    });

    if (this.storage) {
      const cached = await this.storage.getLaundry();
      const updatedList = nextState
        ? [...new Set([...cached.ironing, item.id])]
        : cached.ironing.filter((id) => id !== item.id);
      await this.storage.saveLaundry({ ...cached, ironing: updatedList });

      const curr = this.outfit();
      if (curr) {
        await this.storage.saveOutfit(curr);
      }
    }
    if (this.syncService) {
      await this.syncService.queueLaundryChange('ironing', item.id, nextState ? 'create' : 'delete');
    }
    void this.laundryService.refreshCounts('ironing', action);
    this.toast.success(nextState ? 'Capo aggiunto alla stiratura' : 'Capo rimosso dalla stiratura');
  }

  async toggleAllWashing(event: Event) {
    event.preventDefault();
    event.stopPropagation();

    const currOutfit = this.outfit();
    const clothes = currOutfit?.clothes ?? [];
    if (clothes.length === 0 || this.batchActionBusy()) {
      return;
    }

    const allInWashing = clothes.every((c) => c.isInWashing);
    const nextState = !allInWashing;
    const action: 'add' | 'remove' = nextState ? 'add' : 'remove';

    const changedClothes = nextState
      ? clothes.filter((c) => !c.isInWashing)
      : clothes.filter((c) => c.isInWashing);
    const targetItems = changedClothes.length > 0 ? changedClothes : clothes;

    const triggerBtn = event.currentTarget as HTMLElement;
    this.animateBatchFlyToNav(targetItems, 'washing', action, triggerBtn);

    this.outfit.update((o) => {
      if (!o) return null;
      return {
        ...o,
        clothes: o.clothes.map((c) => ({ ...c, isInWashing: nextState })),
      };
    });

    this.batchActionBusy.set(true);

    try {
      if (this.storage) {
        const cached = await this.storage.getLaundry();
        let updatedWashing = cached.washing ? [...cached.washing] : [];
        if (nextState) {
          const idsToAdd = clothes.map((c) => c.id);
          updatedWashing = [...new Set([...updatedWashing, ...idsToAdd])];
        } else {
          const idsToRemove = new Set(clothes.map((c) => c.id));
          updatedWashing = updatedWashing.filter((id) => !idsToRemove.has(id));
        }
        await this.storage.saveLaundry({ ...cached, washing: updatedWashing });

        const updatedOutfit = this.outfit();
        if (updatedOutfit) {
          await this.storage.saveOutfit(updatedOutfit);
        }
      }

      if (this.syncService) {
        const ids = targetItems.map((c) => c.id);
        if (this.syncService.queueLaundryChanges) {
          await this.syncService.queueLaundryChanges('washing', ids, nextState ? 'create' : 'delete');
        } else {
          for (const item of targetItems) {
            await this.syncService.queueLaundryChange('washing', item.id, nextState ? 'create' : 'delete');
          }
        }
      }

      void this.laundryService.refreshCounts('washing', action);

      this.toast.success(
        nextState
          ? `Tutti i capi (${clothes.length}) messi a lavare`
          : `Tutti i capi rimossi dalla lavatrice`,
      );
    } catch {
      this.toast.error('Errore durante l\'aggiornamento dello stato lavatrice');
    } finally {
      this.batchActionBusy.set(false);
    }
  }

  async toggleAllIroning(event: Event) {
    event.preventDefault();
    event.stopPropagation();

    const currOutfit = this.outfit();
    const clothes = currOutfit?.clothes ?? [];
    if (clothes.length === 0 || this.batchActionBusy()) {
      return;
    }

    const allInIroning = clothes.every((c) => c.isInIroning);
    const nextState = !allInIroning;
    const action: 'add' | 'remove' = nextState ? 'add' : 'remove';

    const changedClothes = nextState
      ? clothes.filter((c) => !c.isInIroning)
      : clothes.filter((c) => c.isInIroning);
    const targetItems = changedClothes.length > 0 ? changedClothes : clothes;

    const triggerBtn = event.currentTarget as HTMLElement;
    this.animateBatchFlyToNav(targetItems, 'ironing', action, triggerBtn);

    this.outfit.update((o) => {
      if (!o) return null;
      return {
        ...o,
        clothes: o.clothes.map((c) => ({ ...c, isInIroning: nextState })),
      };
    });

    this.batchActionBusy.set(true);

    try {
      if (this.storage) {
        const cached = await this.storage.getLaundry();
        let updatedIroning = cached.ironing ? [...cached.ironing] : [];
        if (nextState) {
          const idsToAdd = clothes.map((c) => c.id);
          updatedIroning = [...new Set([...updatedIroning, ...idsToAdd])];
        } else {
          const idsToRemove = new Set(clothes.map((c) => c.id));
          updatedIroning = updatedIroning.filter((id) => !idsToRemove.has(id));
        }
        await this.storage.saveLaundry({ ...cached, ironing: updatedIroning });

        const updatedOutfit = this.outfit();
        if (updatedOutfit) {
          await this.storage.saveOutfit(updatedOutfit);
        }
      }

      if (this.syncService) {
        const ids = targetItems.map((c) => c.id);
        if (this.syncService.queueLaundryChanges) {
          await this.syncService.queueLaundryChanges('ironing', ids, nextState ? 'create' : 'delete');
        } else {
          for (const item of targetItems) {
            await this.syncService.queueLaundryChange('ironing', item.id, nextState ? 'create' : 'delete');
          }
        }
      }

      void this.laundryService.refreshCounts('ironing', action);

      this.toast.success(
        nextState
          ? `Tutti i capi (${clothes.length}) messi a stirare`
          : `Tutti i capi rimossi dalla stiratura`,
      );
    } catch {
      this.toast.error('Errore durante l\'aggiornamento dello stato stiratura');
    } finally {
      this.batchActionBusy.set(false);
    }
  }

  private animateBatchFlyToNav(
    items: ClothesItem[],
    targetType: 'washing' | 'ironing',
    action: 'add' | 'remove',
    triggerButton?: HTMLElement,
  ): void {
    if (typeof document === 'undefined') return;

    if (items.length === 0) {
      if (triggerButton) {
        void this.laundryService.animateFlyToNav(triggerButton, targetType, action);
      }
      return;
    }

    items.forEach((cloth, index) => {
      setTimeout(() => {
        const cardEl = document.querySelector<HTMLElement>(
          `.included-clothes-section [data-item-id="${cloth.id}"]`,
        );
        const canvasEl = document.querySelector<HTMLElement>(
          `.outfit-middle-row [data-cloth-id="${cloth.id}"]`,
        );

        let sourceEl: HTMLElement | null = null;
        if (cardEl && this.isElementPartiallyVisible(cardEl)) {
          sourceEl = cardEl;
        } else if (canvasEl && this.isElementPartiallyVisible(canvasEl)) {
          sourceEl = canvasEl;
        } else {
          sourceEl = cardEl || canvasEl || triggerButton || null;
        }

        void this.laundryService.animateFlyToNav(sourceEl, targetType, action);
      }, index * 85);
    });
  }

  private isElementPartiallyVisible(el: HTMLElement): boolean {
    if (typeof window === 'undefined') return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  async renameOutfit() {
    const current = this.outfit();
    if (!current) return;

    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Rinomina abbinamento',
        description: 'Inserisci il nuovo nome per l\'abbinamento.',
        label: 'Nome abbinamento',
        placeholder: current.name,
        requiredMessage: 'Inserisci il nome dell\'abbinamento',
        confirmLabel: 'Salva',
      },
    });

    const newName = await firstValueFrom(dialogRef.closed);
    if (!newName || newName === current.name) return;

    this.actionBusy.set(true);
    try {
      const updatedOutfit: OutfitDetailResponse = {
        ...current,
        name: newName,
        updatedAt: new Date().toISOString(),
      };
      this.outfit.set(updatedOutfit);

      if (this.storage) {
        await this.storage.saveOutfit(updatedOutfit);
      }

      if (this.syncService) {
        await this.syncService.queueOutfitChange(current.id, 'update', { name: newName });
      }

      if (!this.syncService?.checkIsOffline()) {
        try {
          await firstValueFrom(this.api.updateOutfit(current.id, { name: newName }));
        } catch (apiErr) {
          if (!this.syncService?.isOfflineError(apiErr)) {
            throw apiErr;
          }
        }
      }

      this.toast.success('Abbinamento rinominato con successo');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Impossibile rinominare l\'abbinamento');
    } finally {
      this.actionBusy.set(false);
    }
  }

  async deleteOutfit() {
    const current = this.outfit();
    if (!current) return;

    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Elimina abbinamento',
        message: `Vuoi eliminare l'abbinamento "${current.name}"? I capi non verranno eliminati dal guardaroba.`,
        confirmLabel: 'Elimina',
        cancelLabel: 'Annulla',
        danger: true,
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) return;

    this.actionBusy.set(true);
    try {
      if (this.storage) {
        await this.storage.removeOutfit(current.id);
      }
      if (this.syncService) {
        await this.syncService.queueOutfitChange(current.id, 'delete');
      }

      if (!this.syncService?.checkIsOffline()) {
        try {
          await firstValueFrom(this.api.deleteOutfit(current.id));
        } catch (apiErr) {
          if (!this.syncService?.isOfflineError(apiErr)) {
            throw apiErr;
          }
        }
      }

      this.toast.success(`Abbinamento "${current.name}" eliminato`);
      void this.router.navigate(['/outfits']);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Impossibile eliminare l\'abbinamento');
    } finally {
      this.actionBusy.set(false);
    }
  }
}
