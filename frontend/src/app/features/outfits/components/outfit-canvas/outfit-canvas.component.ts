import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { ToastService } from '../../../../core/toast.service';
import { AttachmentItem, CanvasItemLayout, ClothesItem } from '../../../../core/models';
import { getPrimaryAttachment as resolvePrimaryAttachment } from '../../../../shared/utils/attachment.utils';

@Component({
  selector: 'app-outfit-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './outfit-canvas.component.html',
  styleUrl: './outfit-canvas.component.scss',
})
export class OutfitCanvasComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly outfitId = input.required<string>();
  readonly clothes = input<ClothesItem[]>([]);
  readonly initialLayout = input<Record<string, CanvasItemLayout> | null>(null);

  readonly layoutSaved = output<Record<string, CanvasItemLayout>>();

  @ViewChild('canvasBoard') canvasBoardRef?: ElementRef<HTMLDivElement>;

  readonly itemsLayout = signal<Record<string, CanvasItemLayout>>({});
  readonly selectedClothId = signal<string | null>(null);
  readonly selectedClothIds = signal<string[]>([]);
  readonly isDragging = signal(false);
  readonly isSaving = signal(false);
  readonly saveSuccess = signal(false);

  // Marquee selection box
  readonly selectionBox = signal<{ left: number; top: number; width: number; height: number } | null>(null);

  private marqueeStart: {
    clientX: number;
    clientY: number;
    boardLeft: number;
    boardTop: number;
    boardWidth: number;
    boardHeight: number;
  } | null = null;
  private isMarqueeSelecting = false;

  private groupDragData: {
    startPointerX: number;
    startPointerY: number;
    boardWidth: number;
    boardHeight: number;
    startPositions: Record<string, { x: number; y: number }>;
  } | null = null;

  private maxZIndex = 10;

  constructor() {
    effect(() => {
      const clothesList = this.clothes();
      const customLayout = this.initialLayout();
      untracked(() => {
        this.initLayout(clothesList, customLayout);
      });
    });
  }

  isClothSelected(clothId: string): boolean {
    return this.selectedClothIds().includes(clothId) || this.selectedClothId() === clothId;
  }

  shouldShowItemControls(clothId: string): boolean {
    const list = this.selectedClothIds();
    if (list.length > 0) {
      return list[0] === clothId;
    }
    return this.selectedClothId() === clothId;
  }

  getPrimaryAttachment(cloth: ClothesItem): AttachmentItem | null {
    return resolvePrimaryAttachment(cloth);
  }

  getAttachmentUrl(clothId: string, attachment: AttachmentItem): string {
    return `/api/clothes/${clothId}/attachments/${attachment.id}/file?variant=preview`;
  }

  getClothLayout(clothId: string): CanvasItemLayout {
    const layout = this.itemsLayout()[clothId];
    if (layout) return layout;
    return { x: 50, y: 50, scale: 1, rotation: 0, zIndex: 1 };
  }

  private initLayout(clothes: ClothesItem[], customLayout: Record<string, CanvasItemLayout> | null) {
    if (!clothes || clothes.length === 0) {
      this.itemsLayout.set({});
      return;
    }

    const currentMap = { ...this.itemsLayout() };
    const newMap: Record<string, CanvasItemLayout> = {};
    const unpositionedClothes: ClothesItem[] = [];

    for (const cloth of clothes) {
      if (customLayout && customLayout[cloth.id]) {
        newMap[cloth.id] = { ...customLayout[cloth.id] };
      } else if (currentMap[cloth.id]) {
        newMap[cloth.id] = { ...currentMap[cloth.id] };
      } else {
        unpositionedClothes.push(cloth);
      }
    }

    if (unpositionedClothes.length > 0) {
      const defaultPositions = this.calculateDefaultPositions(unpositionedClothes);
      for (const cloth of unpositionedClothes) {
        newMap[cloth.id] = defaultPositions[cloth.id] || { x: 50, y: 50, scale: 1, zIndex: 1 };
      }
    }

    this.itemsLayout.set(newMap);
  }

  private calculateDefaultPositions(clothes: ClothesItem[]): Record<string, CanvasItemLayout> {
    const result: Record<string, CanvasItemLayout> = {};
    const total = clothes.length;
    if (total === 0) return result;

    if (total === 1) {
      result[clothes[0].id] = { x: 50, y: 50, scale: 1.1, zIndex: 1, rotation: 0 };
      return result;
    }

    if (total === 2) {
      result[clothes[0].id] = { x: 50, y: 32, scale: 1.05, zIndex: 1, rotation: 0 };
      result[clothes[1].id] = { x: 50, y: 68, scale: 1.05, zIndex: 2, rotation: 0 };
      return result;
    }

    if (total === 3) {
      result[clothes[0].id] = { x: 50, y: 25, scale: 1.0, zIndex: 1, rotation: 0 };
      result[clothes[1].id] = { x: 50, y: 52, scale: 1.0, zIndex: 2, rotation: 0 };
      result[clothes[2].id] = { x: 50, y: 78, scale: 1.0, zIndex: 3, rotation: 0 };
      return result;
    }

    if (total === 4) {
      result[clothes[0].id] = { x: 32, y: 30, scale: 0.95, zIndex: 1, rotation: 0 };
      result[clothes[1].id] = { x: 68, y: 30, scale: 0.95, zIndex: 2, rotation: 0 };
      result[clothes[2].id] = { x: 32, y: 70, scale: 0.95, zIndex: 3, rotation: 0 };
      result[clothes[3].id] = { x: 68, y: 70, scale: 0.95, zIndex: 4, rotation: 0 };
      return result;
    }

    const cols = total <= 6 ? 3 : 4;
    const rows = Math.ceil(total / cols);
    clothes.forEach((cloth, idx) => {
      const colIdx = idx % cols;
      const rowIdx = Math.floor(idx / cols);
      const x = 20 + (colIdx * (60 / Math.max(1, cols - 1)));
      const y = 22 + (rowIdx * (56 / Math.max(1, rows - 1)));
      result[cloth.id] = { x, y, scale: 0.9, zIndex: idx + 1, rotation: 0 };
    });

    return result;
  }

  resetLayout() {
    const defaultPos = this.calculateDefaultPositions(this.clothes());
    this.itemsLayout.set(defaultPos);
    this.selectedClothId.set(null);
    this.selectedClothIds.set([]);
    this.toast.info('Disposizione reimpostata. Clicca su "Salva" per confermare.');
  }

  // --- Marquee / Board Drag & Drop Multi-Selection ---

  onBoardPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;

    const board = this.canvasBoardRef?.nativeElement;
    if (!board) return;

    const rect = board.getBoundingClientRect();
    this.isMarqueeSelecting = true;
    this.marqueeStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      boardLeft: rect.left,
      boardTop: rect.top,
      boardWidth: rect.width,
      boardHeight: rect.height,
    };

    try {
      board.setPointerCapture?.(event.pointerId);
    } catch {}

    if (!event.shiftKey) {
      this.selectedClothId.set(null);
      this.selectedClothIds.set([]);
    }
  }

  onBoardPointerMove(event: PointerEvent) {
    if (!this.isMarqueeSelecting || !this.marqueeStart) return;

    const startX = this.marqueeStart.clientX - this.marqueeStart.boardLeft;
    const startY = this.marqueeStart.clientY - this.marqueeStart.boardTop;
    const currentX = event.clientX - this.marqueeStart.boardLeft;
    const currentY = event.clientY - this.marqueeStart.boardTop;

    const left = Math.max(0, Math.min(startX, currentX));
    const top = Math.max(0, Math.min(startY, currentY));
    const width = Math.min(this.marqueeStart.boardWidth - left, Math.abs(currentX - startX));
    const height = Math.min(this.marqueeStart.boardHeight - top, Math.abs(currentY - startY));

    this.selectionBox.set({ left, top, width, height });

    if (width > 8 || height > 8) {
      const minXPct = (left / this.marqueeStart.boardWidth) * 100;
      const maxXPct = ((left + width) / this.marqueeStart.boardWidth) * 100;
      const minYPct = (top / this.marqueeStart.boardHeight) * 100;
      const maxYPct = ((top + height) / this.marqueeStart.boardHeight) * 100;

      const matchedIds: string[] = [];
      for (const cloth of this.clothes()) {
        const pos = this.getClothLayout(cloth.id);
        if (pos.x >= minXPct && pos.x <= maxXPct && pos.y >= minYPct && pos.y <= maxYPct) {
          matchedIds.push(cloth.id);
        }
      }
      this.selectedClothIds.set(matchedIds);
      this.selectedClothId.set(matchedIds[0] ?? null);
    }
  }

  onBoardPointerUp(event: PointerEvent) {
    if (this.isMarqueeSelecting) {
      try {
        this.canvasBoardRef?.nativeElement.releasePointerCapture(event.pointerId);
      } catch {}
      this.isMarqueeSelecting = false;
      this.marqueeStart = null;
      this.selectionBox.set(null);
    }
  }

  // --- Item Drag & Drop (supports single item and multiple selected items moving together) ---

  onItemPointerDown(event: PointerEvent, clothId: string) {
    if (event.button !== 0) return;
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {}

    const currentSelected = this.selectedClothIds();
    let nextSelected: string[];
    if (currentSelected.includes(clothId)) {
      nextSelected = currentSelected;
    } else {
      nextSelected = event.shiftKey ? [...currentSelected, clothId] : [clothId];
    }
    this.selectedClothIds.set(nextSelected);
    this.selectedClothId.set(clothId);
    this.isDragging.set(true);

    // Bring selected items to front
    const updated = { ...this.itemsLayout() };
    for (const id of nextSelected) {
      this.maxZIndex += 1;
      const currentLayout = this.getClothLayout(id);
      updated[id] = { ...currentLayout, zIndex: this.maxZIndex };
    }
    this.itemsLayout.set(updated);

    const board = this.canvasBoardRef?.nativeElement;
    const rect = board?.getBoundingClientRect() ?? { width: 600, height: 500, left: 0, top: 0 };

    const startPositions: Record<string, { x: number; y: number }> = {};
    for (const id of nextSelected) {
      const pos = this.getClothLayout(id);
      startPositions[id] = { x: pos.x, y: pos.y };
    }

    this.groupDragData = {
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      boardWidth: rect.width,
      boardHeight: rect.height,
      startPositions,
    };
  }

  onItemPointerMove(event: PointerEvent, clothId: string) {
    if (!this.isDragging() || !this.groupDragData || !this.isClothSelected(clothId)) return;

    const deltaX = event.clientX - this.groupDragData.startPointerX;
    const deltaY = event.clientY - this.groupDragData.startPointerY;

    const deltaXPct = (deltaX / this.groupDragData.boardWidth) * 100;
    const deltaYPct = (deltaY / this.groupDragData.boardHeight) * 100;

    const updated = { ...this.itemsLayout() };
    for (const id of this.selectedClothIds()) {
      const startPos = this.groupDragData.startPositions[id];
      if (!startPos) continue;

      const newX = Math.min(94, Math.max(6, startPos.x + deltaXPct));
      const newY = Math.min(94, Math.max(6, startPos.y + deltaYPct));
      const current = this.getClothLayout(id);

      updated[id] = {
        ...current,
        x: Math.round(newX * 10) / 10,
        y: Math.round(newY * 10) / 10,
      };
    }

    this.itemsLayout.set(updated);
  }

  onItemPointerUp(event: PointerEvent, clothId: string) {
    if (this.isDragging()) {
      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {}
      this.isDragging.set(false);
      this.groupDragData = null;
    }
  }

  scaleItem(clothId: string, delta: number) {
    const selected = this.selectedClothIds();
    const targets = selected.length > 0 ? selected : [clothId];
    const updated = { ...this.itemsLayout() };
    for (const id of targets) {
      const current = this.getClothLayout(id);
      const currentScale = current.scale ?? 1;
      const newScale = Math.min(1.6, Math.max(0.6, Math.round((currentScale + delta) * 10) / 10));
      updated[id] = { ...current, scale: newScale };
    }
    this.itemsLayout.set(updated);
  }

  // --- Centering Bounding Box of all items on canvas save ---

  centerItemsLayout(): Record<string, CanvasItemLayout> {
    const clothesList = this.clothes();
    if (!clothesList || clothesList.length === 0) {
      return this.itemsLayout();
    }

    const currentLayout = { ...this.itemsLayout() };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const cloth of clothesList) {
      const pos = currentLayout[cloth.id] || this.getClothLayout(cloth.id);
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }

    if (minX === Infinity || maxX === -Infinity || minY === Infinity || maxY === -Infinity) {
      return currentLayout;
    }

    const currentCenterX = (minX + maxX) / 2;
    const currentCenterY = (minY + maxY) / 2;
    const shiftX = 50 - currentCenterX;
    const shiftY = 50 - currentCenterY;

    if (Math.abs(shiftX) < 0.1 && Math.abs(shiftY) < 0.1) {
      return currentLayout;
    }

    const centered: Record<string, CanvasItemLayout> = {};
    for (const cloth of clothesList) {
      const pos = currentLayout[cloth.id] || this.getClothLayout(cloth.id);
      const newX = Math.round((pos.x + shiftX) * 10) / 10;
      const newY = Math.round((pos.y + shiftY) * 10) / 10;
      centered[cloth.id] = {
        ...pos,
        x: Math.min(94, Math.max(6, newX)),
        y: Math.min(94, Math.max(6, newY)),
      };
    }

    return centered;
  }

  async saveLayout() {
    this.isSaving.set(true);
    try {
      const centeredLayout = this.centerItemsLayout();
      this.itemsLayout.set(centeredLayout);

      await firstValueFrom(
        this.api.updateOutfit(this.outfitId(), {
          canvasLayout: centeredLayout,
        }),
      );

      this.saveSuccess.set(true);
      this.layoutSaved.emit(centeredLayout);
      this.toast.success('Disposizione centrata e salvata con successo!');
    } catch {
      this.toast.error('Errore durante il salvataggio della disposizione');
    } finally {
      this.isSaving.set(false);
    }
  }
}
