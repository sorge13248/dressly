import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { LaundryService } from '../../../../core/laundry.service';
import { ToastService } from '../../../../core/toast.service';
import { AttachmentItem, ClothesItem } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { normalizeHexColor } from '../../../../shared/utils/color.utils';
import { WardrobePhotoLightboxModalComponent } from '../../components/photo-lightbox-modal/photo-lightbox-modal.component';
import { ButtonComponent } from '../../../../shared/components/button';
import { WashingIconComponent, IroningIconComponent } from '../../../../shared/components/icons';

interface CareSpec {
  label: string;
  value: string;
  dotsArray?: number[];
}

interface CareTag {
  label: string;
  warn?: boolean;
}

interface CareSectionView {
  title: string;
  specs: CareSpec[];
  tags: CareTag[];
}

type BuyDetailView = {
  store: string | null;
  purchaseDate: string | null;
  price: string | null;
  url: string | null;
};

@Component({
  standalone: true,
  imports: [CommonModule, ButtonComponent, WashingIconComponent, IroningIconComponent],
  templateUrl: './detail.component.html',
  styleUrl: './detail.component.scss',
})
export class WardrobeDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly storage = inject(OfflineStorageService, { optional: true });
  private readonly syncService = inject(SyncService, { optional: true });
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly laundryService = inject(LaundryService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly item = signal<ClothesItem | null>(null);
  private initialLoaded = false;

  constructor() {
    const sync = this.syncService;
    if (sync) {
      effect(() => {
        sync.dataUpdated();
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
          void this.load(id, { silent: this.initialLoaded });
        }
      });
    }
  }

  readonly isInWashing = computed(() => Boolean(this.item()?.isInWashing));
  readonly isInIroning = computed(() => Boolean(this.item()?.isInIroning));

  readonly title = computed(() => this.item()?.name || this.item()?.fullTitle || this.item()?.brand?.name || 'Capo');
  readonly photoAttachments = computed(() =>
    (this.item()?.attachments ?? []).filter((attachment) => attachment.mimeType?.startsWith('image/')),
  );
  readonly primaryPhoto = computed(() => this.photoAttachments()[0] ?? null);
  readonly secondaryPhotos = computed(() => this.photoAttachments().slice(1));
  readonly photoCount = computed(() => this.photoAttachments().length);
  readonly careSections = computed<CareSectionView[]>(() => {
    const current = this.item();
    if (!current) {
      return [];
    }

    const wash = current.washingInstruction;
    const washSpecs: CareSpec[] = [];
    const washType = this.labelWashType(wash?.washType ?? wash?.wash_type);
    if (washType) {
      washSpecs.push({ label: 'Tipo', value: washType });
    }
    const washTemp = this.appendDegrees(wash?.temperature ?? wash?.washing_temperature);
    if (washTemp) {
      washSpecs.push({ label: 'Temperatura', value: washTemp });
    }
    const bleach = this.labelBleachType(wash?.bleachType ?? wash?.bleach_type);
    if (bleach) {
      washSpecs.push({ label: 'Sbianca', value: bleach });
    }

    const washTags: CareTag[] = [];
    if (wash?.reverseWashing ?? wash?.reverse_washing) {
      washTags.push({ label: 'Lava al rovescio' });
    }
    if (wash?.closedZips ?? wash?.closed_zips) {
      washTags.push({ label: 'Cerniere chiuse' });
    }
    if (wash?.similarColors ?? wash?.similar_colors) {
      washTags.push({ label: 'Colori simili' });
    }
    if (wash?.washSeparately ?? wash?.wash_separately) {
      washTags.push({ label: 'Lavare separatamente' });
    }
    if (wash?.useColorCatcher ?? wash?.use_color_catcher) {
      washTags.push({ label: 'Acchiappacolore' });
    }
    if (wash?.stretch) {
      washTags.push({ label: 'Stretch' });
    }

    const colorLoss = wash?.colorLossRisk ?? wash?.color_loss;
    const colorTestTemp = wash?.colorLossTestTemperature ?? wash?.color_loss_test_temperature;
    if (colorLoss) {
      const testTempStr = this.appendDegrees(colorTestTemp);
      washTags.push({
        label: testTempStr ? `Perde colore (test: ${testTempStr})` : 'Perde colore',
        warn: true,
      });
    } else if (colorTestTemp) {
      washSpecs.push({
        label: 'Test colore',
        value: this.appendDegrees(colorTestTemp)!,
      });
    }

    const dry = current.dryingInstruction;
    const drySpecs: CareSpec[] = [];
    const tumbleDry = dry?.tumbleDry ?? dry?.tumble_dry;
    const tumbleDryTemp = dry?.tumbleDryTemperature ?? dry?.tumble_dry_temperature;
    if (tumbleDry === true) {
      const tempLabel = this.labelDryingTemperature(tumbleDryTemp);
      drySpecs.push({
        label: 'Asciugatrice',
        value: tempLabel ? `✅ (${tempLabel})` : '✅',
      });
    } else if (tumbleDry === false) {
      drySpecs.push({ label: 'Asciugatrice', value: '❌' });
    }

    const rawMethod = dry?.method;
    if (rawMethod && !rawMethod.startsWith('tumble_dry')) {
      const dryMethod = this.labelDryingMethod(rawMethod);
      if (dryMethod) {
        drySpecs.push({ label: 'Metodo', value: dryMethod });
      }
    }

    const iron = current.ironingInstruction;
    const ironSpecs: CareSpec[] = [];
    const ironType = this.labelIronType(iron?.ironType ?? iron?.iron_type);
    if (ironType) {
      ironSpecs.push({ label: 'Tipo', value: ironType });
    }
    const ironTemp = this.normalizeText(
      iron?.temperature ?? (iron?.ironing_temperature != null ? String(iron.ironing_temperature) : null),
    );
    if (ironTemp) {
      const dotsArray = this.parseIroningDots(ironTemp);
      ironSpecs.push({
        label: 'Temperatura',
        value: ironTemp,
        dotsArray: dotsArray ?? undefined,
      });
    }

    const ironTags: CareTag[] = [];
    if (iron?.ironInsideOut ?? iron?.inside_out) {
      ironTags.push({ label: 'Stira al rovescio' });
    }

    const sections: CareSectionView[] = [
      {
        title: 'Lavaggio',
        specs: washSpecs,
        tags: washTags,
      },
      {
        title: 'Asciugatura',
        specs: drySpecs,
        tags: [],
      },
      {
        title: 'Stiratura',
        specs: ironSpecs,
        tags: ironTags,
      },
    ];

    return sections.filter((section) => section.specs.length > 0 || section.tags.length > 0);
  });
  readonly buyDetailView = computed<BuyDetailView | null>(() => {
    const buyDetail = this.item()?.buyDetail;
    if (!buyDetail) {
      return null;
    }

    const url = this.normalizeUrl(buyDetail.shopUrl ?? buyDetail.shop_url);

    return {
      store: this.normalizeText(buyDetail.store ?? buyDetail.shop_name),
      purchaseDate: this.formatDate(buyDetail.purchaseDate ?? buyDetail.purchase_date),
      price: this.formatPrice(buyDetail.priceCents),
      url,
    };
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('ID capo non trovato');
      this.loading.set(false);
      return;
    }

    this.load(id);
  }

  async load(id: string, options?: { silent?: boolean }) {
    const isSilent = options?.silent ?? (this.initialLoaded && this.item() !== null);
    if (!isSilent) {
      this.loading.set(true);
    }
    this.error.set(null);

    try {
      if (this.storage) {
        const cached = await this.storage.getClothes(id);
        if (cached) {
          const laundry = await this.storage.getLaundry();
          const isInWashing = laundry.washing.includes(cached.id);
          const isInIroning = laundry.ironing.includes(cached.id);
          this.item.set({ ...cached, isInWashing, isInIroning });
          this.initialLoaded = true;
          this.loading.set(false);

          if (this.syncService && !this.syncService.checkIsOffline() && !isSilent) {
            void this.refreshFromServerSilently(id);
          }
          return;
        }
      }

      const item = await firstValueFrom(this.api.getClothes(id));
      if (item) {
        const laundry = this.storage ? await this.storage.getLaundry() : { washing: [], ironing: [] };
        const isInWashing = laundry.washing.includes(item.id);
        const isInIroning = laundry.ironing.includes(item.id);
        this.item.set({ ...item, isInWashing, isInIroning });
        this.initialLoaded = true;
        if (this.storage) {
          await this.storage.saveClothes([item]);
        }
        return;
      }
      this.item.set(null);
      this.error.set('Capo non trovato');
    } catch (error) {
      if (!this.item()) {
        this.error.set(error instanceof Error ? error.message : 'Impossibile caricare il capo');
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshFromServerSilently(id: string) {
    try {
      const item = await firstValueFrom(this.api.getClothes(id));
      if (item) {
        const laundry = this.storage ? await this.storage.getLaundry() : { washing: [], ironing: [] };
        const isInWashing = laundry.washing.includes(item.id);
        const isInIroning = laundry.ironing.includes(item.id);
        this.item.set({ ...item, isInWashing, isInIroning });
        if (this.storage) {
          await this.storage.saveClothes([item]);
        }
      }
    } catch {
      // Silent error in background
    }
  }

  async toggleWashing() {
    const current = this.item();
    if (!current?.id) return;

    const action = current.isInWashing ? 'remove' : 'add';
    const heroImg = document.querySelector<HTMLElement>('.hero-photo img') || document.querySelector<HTMLElement>('.hero-photo');
    void this.laundryService.animateFlyToNav(heroImg, 'washing', action);

    const nextState = !current.isInWashing;
    this.item.update((prev) => (prev ? { ...prev, isInWashing: nextState } : prev));
    if (this.storage) {
      const cached = await this.storage.getLaundry();
      const updatedList = nextState
        ? [...new Set([...cached.washing, current.id])]
        : cached.washing.filter((id) => id !== current.id);
      await this.storage.saveLaundry({ ...cached, washing: updatedList });
    }
    if (this.syncService) {
      await this.syncService.queueLaundryChange('washing', current.id, nextState ? 'create' : 'delete');
    }
    void this.laundryService.refreshCounts('washing', action);
    this.toast.success(nextState ? 'Capo aggiunto alla lavatrice' : 'Capo rimosso dalla lavatrice');
  }

  async toggleIroning() {
    const current = this.item();
    if (!current?.id) return;

    const action = current.isInIroning ? 'remove' : 'add';
    const heroImg = document.querySelector<HTMLElement>('.hero-photo img') || document.querySelector<HTMLElement>('.hero-photo');
    void this.laundryService.animateFlyToNav(heroImg, 'ironing', action);

    const nextState = !current.isInIroning;
    this.item.update((prev) => (prev ? { ...prev, isInIroning: nextState } : prev));
    if (this.storage) {
      const cached = await this.storage.getLaundry();
      const updatedList = nextState
        ? [...new Set([...cached.ironing, current.id])]
        : cached.ironing.filter((id) => id !== current.id);
      await this.storage.saveLaundry({ ...cached, ironing: updatedList });
    }
    if (this.syncService) {
      await this.syncService.queueLaundryChange('ironing', current.id, nextState ? 'create' : 'delete');
    }
    void this.laundryService.refreshCounts('ironing', action);
    this.toast.success(nextState ? 'Capo aggiunto alla stiratura' : 'Capo rimosso dalla stiratura');
  }

  edit() {
    const id = this.item()?.id;
    if (id) {
      void this.router.navigate(['/wardrobe', id, 'edit']);
    }
  }

  async remove() {
    const id = this.item()?.id;
    if (!id) {
      return;
    }

    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Elimina capo',
        message: `Eliminare ${this.title()}?`,
        confirmLabel: 'Elimina',
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) {
      return;
    }

    // Local-First: delete directly from local storage and queue sync
    if (this.storage) {
      await this.storage.removeClothes([id]);
    }
    if (this.syncService) {
      await this.syncService.queueClothesChange(id, 'delete');
    }
    this.toast.success('Capo eliminato');
    void this.router.navigateByUrl('/wardrobe');
  }

  openPhoto(attachment: AttachmentItem) {
    const clothesId = this.item()?.id;
    if (!clothesId) {
      return;
    }

    const explicitName = this.normalizeText(attachment.originalName);
    const attachmentLabel = explicitName ?? 'Foto capo';

    this.dialog.open(WardrobePhotoLightboxModalComponent, {
      data: {
        src: this.getAttachmentUrl(clothesId, attachment),
        alt: attachmentLabel,
        title: explicitName,
      },
    });
  }

  attachmentLabel(attachment: AttachmentItem) {
    return this.normalizeText(attachment.originalName) ?? 'Foto capo';
  }

  goToMainWithFilter(key: string, value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return;
    }

    this.navigateToMain({ [key]: normalized });
  }

  resolveColorHex(hexCode: string | null) {
    return normalizeHexColor(hexCode);
  }

  getAttachmentUrl(clothesId: string, attachment: AttachmentItem) {
    return `/api/clothes/${clothesId}/attachments/${attachment.id}/file`;
  }

  getPreviewAttachmentUrl(clothesId: string, attachment: AttachmentItem) {
    const variant = attachment.previewPath ? '?variant=preview' : '';
    return `${this.getAttachmentUrl(clothesId, attachment)}${variant}`;
  }

  hasItems<T>(items: T[] | null | undefined) {
    return (items?.length ?? 0) > 0;
  }

  private labelWashType(value: string | null | undefined) {
    switch (value) {
      case 'do_not_wash':
        return 'Non lavare';
      case 'hand_wash_only':
        return 'Solo a mano';
      case 'washer_ok':
        return 'Lavatrice ok';
      default:
        return null;
    }
  }

  private labelBleachType(value: string | null | undefined) {
    switch (value) {
      case 'no_bleach':
        return 'Nessuna';
      case 'non_chlorine_bleach':
        return 'Senza cloro';
      case 'any_bleach':
        return 'Qualsiasi';
      default:
        return null;
    }
  }

  private labelDryingTemperature(value: string | null | undefined) {
    switch (value) {
      case 'low':
        return 'Bassa';
      case 'medium':
        return 'Media';
      case 'high':
        return 'Alta';
      default:
        return null;
    }
  }

  private labelDryingMethod(value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }

    if (normalized === 'air_dry') {
      return 'Asciugatura all\'aria';
    }

    if (normalized.startsWith('tumble_dry:')) {
      const level = normalized.slice('tumble_dry:'.length).trim();
      const levelLabel = this.labelDryingTemperature(level);
      return levelLabel ? `Asciugatrice (${levelLabel})` : 'Asciugatrice';
    }

    return normalized;
  }

  private labelIronType(value: string | null | undefined) {
    switch (value) {
      case 'yes':
        return 'Si';
      case 'without_steam':
        return 'Senza vapore';
      case 'no':
        return 'No';
      default:
        return null;
    }
  }

  private parseIroningDots(value: string | number | null | undefined): number[] | null {
    const normalized = this.normalizeText(value === null || value === undefined ? null : String(value));
    if (!normalized) {
      return null;
    }

    const num = Number(normalized);
    if (Number.isNaN(num) || num <= 0) {
      return null;
    }

    let count: number;
    if (num <= 1) {
      count = 1;
    } else if (num === 2) {
      count = 2;
    } else if (num === 3) {
      count = 3;
    } else if (num <= 110) {
      count = 1;
    } else if (num <= 150) {
      count = 2;
    } else {
      count = 3;
    }

    return Array.from({ length: count }, (_, i) => i + 1);
  }

  private appendDegrees(value: string | number | null | undefined) {
    const normalized = this.normalizeText(value === null || value === undefined ? null : String(value));
    return normalized ? `${normalized}°C` : null;
  }

  private formatPrice(priceCents: number | null | undefined) {
    if (priceCents == null) {
      return null;
    }

    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(priceCents / 100);
  }

  private formatDate(value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return normalized;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  private normalizeText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeUrl(value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }

    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    return null;
  }

  copyTagCode(code: string) {
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(code)
        .then(() => {
          this.toast.success(`ID etichetta "${code}" copiato negli appunti`);
        })
        .catch(() => {
          this.toast.info(`ID etichetta: ${code}`);
        });
    } else {
      this.toast.info(`ID etichetta: ${code}`);
    }
  }

  private navigateToMain(queryParams: Params) {
    void this.router.navigate(['/wardrobe'], { queryParams });
  }
}