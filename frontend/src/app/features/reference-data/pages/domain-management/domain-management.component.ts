import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { ToastService } from '../../../../core/toast.service';
import { ReferenceKind, BaseReferenceItem } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import {
  ReferenceEditorDialogResult,
  ReferenceEditorModalComponent,
} from '../../components/reference-editor-modal/reference-editor-modal.component';

type TabMeta = {
  key: ReferenceKind;
  label: string;
  emoji: string;
  tone: 'blue' | 'green' | 'amber' | 'rose' | 'teal' | 'violet';
};

type ReferenceDisplayRow = BaseReferenceItem & Partial<Record<'hexCode' | 'logoUrl' | 'icon', string | null>>;

const tabs = [
  { key: 'colors', label: 'Colori', emoji: '🎨', tone: 'blue' },
  { key: 'brands', label: 'Marchi', emoji: '🏷️', tone: 'violet' },
  { key: 'seasons', label: 'Stagioni', emoji: '🍂', tone: 'amber' },
  { key: 'temperatures', label: 'Temperature', emoji: '🌡️', tone: 'rose' },
  { key: 'use-cases', label: 'Occasioni', emoji: '🗓️', tone: 'teal' },
  { key: 'fits', label: 'Vestibilità', emoji: '📏', tone: 'green' },
  { key: 'materials', label: 'Materiali', emoji: '🧵', tone: 'teal' },
  { key: 'types', label: 'Tipi', emoji: '👕', tone: 'blue' },
  { key: 'tags', label: 'Tag', emoji: '✨', tone: 'violet' },
] as const satisfies readonly TabMeta[];

@Component({
  standalone: true,
  imports: [CommonModule, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './domain-management.component.html',
  styleUrl: './domain-management.component.scss',
})
export class DomainManagementPageComponent {
    private readonly sortableKinds: ReferenceKind[] = ['colors', 'seasons', 'temperatures', 'use-cases', 'fits', 'materials'];

  private readonly referenceStore = inject(ReferenceStoreService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);

  readonly tabs = tabs;
  readonly selectedKind = signal<ReferenceKind>('colors');
  readonly selectedTab = computed(() => this.tabs.find((tab) => tab.key === this.selectedKind()) ?? this.tabs[0]);
  readonly rows = computed(() => {
    switch (this.selectedKind()) {
      case 'colors':
        return this.referenceStore.colors();
      case 'brands':
        return this.referenceStore.brands();
      case 'seasons':
        return this.referenceStore.seasons();
      case 'temperatures':
        return this.referenceStore.temperatures();
      case 'use-cases':
        return this.referenceStore.useCases();
      case 'fits':
        return this.referenceStore.fits();
      case 'materials':
        return this.referenceStore.materials();
      case 'types':
        return this.referenceStore.types();
      case 'tags':
        return this.referenceStore.tags();
    }
  });

  readonly busy = signal(false);
  readonly draggedRowId = signal<string | null>(null);

  constructor() {
    effect(() => {
      void this.referenceStore.load(this.selectedKind());
    });
  }

  readonly extraLabel = computed(() => {
    switch (this.selectedKind()) {
      case 'colors':
        return 'Hex code';
      case 'brands':
        return 'Logo URL';
      case 'seasons':
      case 'temperatures':
      case 'use-cases':
        return 'Icona';
      default:
        return 'Extra';
    }
  });

  readonly showSortOrder = computed(() => this.sortableKinds.includes(this.selectedKind()));

  select(kind: ReferenceKind) {
    this.selectedKind.set(kind);
  }

  onDragStarted(rowId: string) {
    this.draggedRowId.set(rowId);
  }

  onDragEnded() {
    this.draggedRowId.set(null);
  }

  async dropRow(event: CdkDragDrop<ReferenceDisplayRow[]>) {
    this.draggedRowId.set(null);

    if (!this.showSortOrder() || this.busy() || event.previousIndex === event.currentIndex) {
      return;
    }

    const reordered = [...this.rows()];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    const kind = this.selectedKind();
    const previousSnapshot = this.referenceStore.applyOptimisticOrder(
      kind,
      reordered.map((row) => row.id),
    );

    this.busy.set(true);
    try {
      for (let index = 0; index < reordered.length; index += 1) {
        const row = reordered[index];
        if (row.sortOrder === index) {
          continue;
        }

        await this.referenceStore.update(kind, row.id, { sortOrder: index });
      }

      this.toast.success('Ordine aggiornato');
    } catch (error) {
      this.referenceStore.restore(kind, previousSnapshot);
      this.toast.error(error instanceof Error ? error.message : 'Impossibile aggiornare l ordine');
    } finally {
      this.busy.set(false);
    }
  }

  async openCreateModal() {
    await this.openEditorModal('create');
  }

  async edit(row: ReferenceDisplayRow) {
    await this.openEditorModal('edit', row);
  }

  async remove(row: BaseReferenceItem) {
    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Elimina dominio',
        message: `Eliminare ${row.name}?`,
        confirmLabel: 'Elimina',
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) {
      return;
    }

    this.busy.set(true);

    try {
      await this.referenceStore.remove(this.selectedKind(), row.id);
      this.toast.success('Eliminato correttamente');
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Impossibile eliminare l elemento');
    } finally {
      this.busy.set(false);
    }
  }

  viewInWardrobe(row: BaseReferenceItem) {
    const queryParams = this.queryParamsForCurrentKind(row.id);
    void this.router.navigate(['/wardrobe'], { queryParams });
  }

  chipTone(kind: ReferenceKind) {
    return this.tabs.find((tab) => tab.key === kind)?.tone ?? 'blue';
  }

  rowEmoji(row: ReferenceDisplayRow) {
    if (this.selectedKind() === 'colors') {
      return '';
    }

    if (this.selectedKind() === 'seasons' || this.selectedKind() === 'temperatures' || this.selectedKind() === 'use-cases') {
      return row.icon?.trim() ?? '';
    }

    return this.selectedTab().emoji;
  }

  rowColorHex(row: ReferenceDisplayRow) {
    if (this.selectedKind() !== 'colors') {
      return null;
    }

    const color = row.hexCode?.trim();
    if (!color) {
      return null;
    }

    return color;
  }

  private async openEditorModal(mode: 'create' | 'edit', row?: ReferenceDisplayRow) {
    const dialogRef = this.dialog.open<ReferenceEditorDialogResult | null>(ReferenceEditorModalComponent, {
      data: {
        mode,
        tabLabel: this.selectedTab().label,
        tabEmoji: this.selectedTab().emoji,
        extraLabel: this.extraLabel(),
        showSortOrder: this.showSortOrder(),
        usesColorPicker: this.selectedKind() === 'colors',
        initial: {
          name: row?.name ?? '',
          sortOrder: this.showSortOrder() ? String(row?.sortOrder ?? '') : '',
          extra:
            this.selectedKind() === 'colors'
              ? String(row?.hexCode ?? '#5a9de8')
              : String(row?.hexCode ?? row?.logoUrl ?? row?.icon ?? ''),
        },
      },
    });

    const result = await firstValueFrom(dialogRef.closed);
    if (!result) {
      return;
    }

    const payload = this.buildPayload(result);

    this.busy.set(true);

    try {
      if (mode === 'edit' && row) {
        await this.referenceStore.update(this.selectedKind(), row.id, payload);
      } else {
        await this.referenceStore.create(this.selectedKind(), payload);
      }

      this.toast.success('Salvato correttamente');
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Errore durante il salvataggio');
    } finally {
      this.busy.set(false);
    }
  }

  private buildPayload(result: ReferenceEditorDialogResult) {
    const payload: Record<string, unknown> = {
      name: result.name,
    };

    if (this.showSortOrder()) {
      payload['sortOrder'] = Number(result.sortOrder || 0);
    }

    if (this.selectedKind() === 'colors') payload['hexCode'] = result.extra || null;
    if (this.selectedKind() === 'brands') payload['logoUrl'] = result.extra || null;
    if (['seasons', 'temperatures', 'use-cases'].includes(this.selectedKind())) payload['icon'] = result.extra || null;

    return payload;
  }

  private queryParamsForCurrentKind(id: string) {
    switch (this.selectedKind()) {
      case 'brands':
        return { brand_id: id };
      case 'fits':
        return { fit_id: id };
      case 'colors':
        return { color_ids: id };
      case 'materials':
        return { material_ids: id };
      case 'seasons':
        return { season_ids: id };
      case 'temperatures':
        return { temperature_ids: id };
      case 'use-cases':
        return { use_case_ids: id };
      case 'types':
        return { type_id: id };
      case 'tags':
        return { tag_ids: id };
    }
  }
}