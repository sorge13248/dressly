import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { AttachmentItem, ClothesItem } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { normalizeHexColor } from '../../../../shared/utils/color.utils';
import { WardrobePhotoLightboxModalComponent } from '../../components/photo-lightbox-modal/photo-lightbox-modal.component';

type DetailRow = {
  label: string;
  value: string;
};

type BuyDetailView = {
  store: string | null;
  purchaseDate: string | null;
  price: string | null;
  url: string | null;
};

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail.component.html',
  styleUrl: './detail.component.scss',
})
export class WardrobeDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(Dialog);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly item = signal<ClothesItem | null>(null);

  readonly title = computed(() => this.item()?.name || this.item()?.fullTitle || this.item()?.brand?.name || 'Capo');
  readonly photoAttachments = computed(() =>
    (this.item()?.attachments ?? []).filter((attachment) => attachment.mimeType?.startsWith('image/')),
  );
  readonly primaryPhoto = computed(() => this.photoAttachments()[0] ?? null);
  readonly secondaryPhotos = computed(() => this.photoAttachments().slice(1));
  readonly photoCount = computed(() => this.photoAttachments().length);
  readonly careSections = computed(() => {
    const current = this.item();
    if (!current) {
      return [];
    }

    return [
      {
        title: 'Lavaggio',
        rows: [
          this.row('Tipo lavaggio', this.labelWashType(current.washingInstruction?.washType)),
          this.row('Sbianca', this.labelBleachType(current.washingInstruction?.bleachType)),
          this.row('Temperatura', this.appendDegrees(current.washingInstruction?.temperature)),
          this.booleanRow('Stretch', current.washingInstruction?.stretch),
          this.booleanRow('Lava al rovescio', current.washingInstruction?.reverseWashing),
          this.booleanRow('Cerniere chiuse', current.washingInstruction?.closedZips),
          this.booleanRow('Colori simili', current.washingInstruction?.similarColors),
          this.booleanRow('Lavare separatamente', current.washingInstruction?.washSeparately),
          this.booleanRow('Acchiappacolore', current.washingInstruction?.useColorCatcher),
          this.booleanRow('Perde colore', current.washingInstruction?.colorLossRisk),
          this.row(
            'Temperatura test perdita colore',
            this.appendDegrees(current.washingInstruction?.colorLossTestTemperature),
          ),
        ].filter((row): row is DetailRow => row !== null),
      },
      {
        title: 'Asciugatura',
        rows: [
          this.booleanRow('Asciugatrice', current.dryingInstruction?.tumbleDry),
          this.row('Temperatura tumble dry', this.labelDryingTemperature(current.dryingInstruction?.tumbleDryTemperature)),
          this.row('Metodo', this.labelDryingMethod(current.dryingInstruction?.method)),
        ].filter((row): row is DetailRow => row !== null),
      },
      {
        title: 'Stiratura',
        rows: [
          this.row('Tipo', this.labelIronType(current.ironingInstruction?.ironType)),
          this.booleanRow('Rovescio', current.ironingInstruction?.ironInsideOut),
          this.row('Temperatura', current.ironingInstruction?.temperature),
        ].filter((row): row is DetailRow => row !== null),
      },
    ].filter((section) => section.rows.length > 0);
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

  async load(id: string) {
    this.loading.set(true);
    this.error.set(null);

    try {
      const item = await firstValueFrom(this.api.getClothes(id));
      this.item.set(item ?? null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile caricare il capo');
    } finally {
      this.loading.set(false);
    }
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

    await firstValueFrom(this.api.deleteClothes(id));
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

  hasItems<T>(items: T[] | null | undefined) {
    return (items?.length ?? 0) > 0;
  }

  private row(label: string, value: string | null | undefined): DetailRow | null {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }

    return { label, value: normalized };
  }

  private booleanRow(label: string, value: boolean | null | undefined): DetailRow | null {
    const emoji = this.booleanEmoji(value);
    if (!emoji) {
      return null;
    }

    return { label, value: emoji };
  }

  private booleanEmoji(value: boolean | null | undefined) {
    if (value === true) {
      return '✅';
    }

    if (value === false) {
      return '❌';
    }

    return null;
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

  private navigateToMain(queryParams: Params) {
    void this.router.navigate(['/wardrobe'], { queryParams });
  }
}