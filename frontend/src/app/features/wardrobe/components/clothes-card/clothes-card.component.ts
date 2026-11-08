import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AttachmentItem, ClothesItem } from '../../../../core/models';
import { normalizeHexColor } from '../../../../shared/utils/color.utils';
import { WashingIconComponent, IroningIconComponent, OutfitIconComponent } from '../../../../shared/components/icons';

@Component({
  selector: 'app-clothes-card',
  standalone: true,
  imports: [CommonModule, RouterLink, WashingIconComponent, IroningIconComponent, OutfitIconComponent],
  templateUrl: './clothes-card.component.html',
  styleUrl: './clothes-card.component.scss',
})
export class ClothesCardComponent {
  readonly item = input.required<ClothesItem>();
  readonly selectable = input<boolean>(false);
  readonly selected = input<boolean>(false);
  readonly showOutfit = input<boolean>(true);
  readonly showRemove = input<boolean>(false);
  readonly showActions = input<boolean>(true);
  readonly variant = input<'standard' | 'mini'>('standard');
  readonly cardClickBehavior = input<'navigate' | 'select' | 'none'>('navigate');
  readonly actionPending = input<boolean>(false);
  readonly linkPrefix = input<string | null>('/wardrobe');

  readonly selectionChange = output<{ id: string; event: Event }>();
  readonly cardClick = output<{ item: ClothesItem; event: Event }>();
  readonly removeClick = output<{ item: ClothesItem; event: Event }>();
  readonly outfitClick = output<{ item: ClothesItem; event: Event }>();
  readonly washingClick = output<{ item: ClothesItem; event: Event }>();
  readonly ironingClick = output<{ item: ClothesItem; event: Event }>();

  getPrimaryAttachment(item: ClothesItem): AttachmentItem | null {
    const attachments = item.attachments ?? [];
    const imageAttachment = attachments.find((attachment) => attachment.mimeType?.startsWith('image/'));
    return imageAttachment ?? attachments[0] ?? null;
  }

  getAttachmentUrl(item: ClothesItem, attachment: AttachmentItem) {
    const variant = attachment.previewPath ? '?variant=preview' : '';
    return `/api/clothes/${item.id}/attachments/${attachment.id}/file${variant}`;
  }

  getPreferredLabel(item: ClothesItem) {
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

  getLocationLabel(item: ClothesItem): string {
    if (item.status === 'in_storage') {
      if (item.location) {
        const room = item.location.room?.name;
        return room ? `${room} › ${item.location.name}` : item.location.name;
      }
      return 'In deposito';
    }
    if (item.status === 'dismissed') {
      return 'Dismesso';
    }
    return '';
  }

  resolveColorHex(hexCode: string | null | undefined) {
    return normalizeHexColor(hexCode ?? null);
  }

  hasItems(list: unknown[] | null | undefined): boolean {
    return Array.isArray(list) && list.length > 0;
  }

  listItemNames(list: Array<{ name?: string | null }> | null | undefined): string {
    if (!list || list.length === 0) {
      return '';
    }
    return list
      .map((item) => item.name?.trim())
      .filter((name): name is string => Boolean(name))
      .join(', ');
  }

  openDetailInNewTab(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const base = this.linkPrefix() || '/wardrobe';
    const url = `${base}/${this.item().id}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onCardClick(event: Event) {
    if (this.cardClickBehavior() === 'select') {
      event.preventDefault();
      this.selectionChange.emit({ id: this.item().id, event });
      this.cardClick.emit({ item: this.item(), event });
    } else if (!this.linkPrefix()) {
      this.cardClick.emit({ item: this.item(), event });
    }
  }

  onToggleSelection(event: Event) {
    event.stopPropagation();
    this.selectionChange.emit({ id: this.item().id, event });
  }

  onRemoveClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.removeClick.emit({ item: this.item(), event });
  }

  onAddToOutfit(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.outfitClick.emit({ item: this.item(), event });
  }

  onToggleWashing(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.washingClick.emit({ item: this.item(), event });
  }

  onToggleIroning(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.ironingClick.emit({ item: this.item(), event });
  }
}

