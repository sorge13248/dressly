import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ButtonComponent } from '../../../../shared/components/button';
import { SelectDropdownComponent, SelectDropdownOption } from '../../../../shared/components/select-dropdown/select-dropdown.component';
import { ReferenceStoreService } from '../../../../core/reference-store.service';

export interface LocationSelectModalData {
  count: number;
}

export interface LocationSelectModalResult {
  locationId: string | null;
}

@Component({
  selector: 'app-location-select-modal',
  standalone: true,
  imports: [CommonModule, ButtonComponent, SelectDropdownComponent],
  template: `
    <div class="modal-shell" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-header">
        <h2 id="modal-title">📦 Riponi in deposito</h2>
        <p class="modal-desc">
          Stai per spostare {{ data.count }} {{ data.count === 1 ? 'capo' : 'capi' }} in deposito.
          Seleziona dove verranno riposti:
        </p>
      </header>

      <div class="modal-body">
        <label class="field-label">
          <span>Posizione / Scatola</span>
          <app-select-dropdown
            placeholder="Seleziona posizione (opzionale)"
            [searchable]="true"
            [options]="locationOptions()"
            [selectedId]="selectedLocationId()"
            (selectedIdChange)="selectedLocationId.set($event)"
          />
        </label>
      </div>

      <footer class="modal-footer">
        <button type="button" appButton variant="ghost" (click)="close()">Annulla</button>
        <button type="button" appButton variant="primary" (click)="confirm()">
          Conferma e riponi
        </button>
      </footer>
    </div>
  `,
  styles: [`
    .modal-shell {
      background: #ffffff;
      border-radius: 16px;
      padding: 24px;
      max-width: 440px;
      width: calc(100vw - 32px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .modal-header h2 {
      margin: 0 0 6px;
      font-size: 1.25rem;
      font-weight: 700;
      color: #1e293b;
    }
    .modal-desc {
      margin: 0;
      font-size: 0.9rem;
      color: #64748b;
      line-height: 1.4;
    }
    .modal-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .field-label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      color: #334155;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
    }
  `],
})
export class LocationSelectModalComponent {
  readonly data = inject<LocationSelectModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<LocationSelectModalResult | null>);
  private readonly referenceStore = inject(ReferenceStoreService);

  readonly selectedLocationId = signal<string>('');

  readonly locationOptions = computed<SelectDropdownOption[]>(() => {
    const sorted = this.referenceStore.locationsSortedByRoomAndName();
    const roomsMap = new Map(this.referenceStore.rooms().map((r) => [r.id, r.name]));
    return [
      { id: '', label: 'Nessuna posizione specifica' },
      ...sorted.map((loc) => {
        const roomName = loc.roomId ? roomsMap.get(loc.roomId) : null;
        return {
          id: loc.id,
          label: roomName ? `${roomName} › ${loc.name}` : loc.name,
          emoji: '📍',
        };
      }),
    ];
  });

  close() {
    this.dialogRef.close(null);
  }

  confirm() {
    this.dialogRef.close({
      locationId: this.selectedLocationId() || null,
    });
  }
}
