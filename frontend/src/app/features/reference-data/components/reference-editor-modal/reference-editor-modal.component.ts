import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormField, form, pattern, required } from '@angular/forms/signals';
import { ButtonComponent } from '../../../../shared/components/button';

type ReferenceEditorMode = 'create' | 'edit';

export type ReferenceEditorDialogData = {
  mode: ReferenceEditorMode;
  tabLabel: string;
  tabEmoji: string;
  extraLabel: string;
  showSortOrder: boolean;
  usesColorPicker: boolean;
  isLocation?: boolean;
  isWashingProgram?: boolean;
  isDetergent?: boolean;
  hideExtra?: boolean;
  roomOptions?: { id: string; name: string }[];
  initial: {
    name: string;
    sortOrder: string;
    extra: string;
    roomId?: string;
    temperature?: string;
    spinSpeed?: string;
    description?: string;
  };
};

export type ReferenceEditorDialogResult = {
  name: string;
  sortOrder: string;
  extra: string;
  roomId?: string | null;
  temperature?: string | null;
  spinSpeed?: string | null;
  description?: string | null;
};

@Component({
  selector: 'app-reference-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, FormField, ButtonComponent],
  templateUrl: './reference-editor-modal.component.html',
  styleUrl: './reference-editor-modal.component.scss',
})
export class ReferenceEditorModalComponent {
  readonly data = inject<ReferenceEditorDialogData>(DIALOG_DATA);
  readonly model = signal({
    name: this.data.initial.name,
    sortOrder: this.data.initial.sortOrder,
    extra: this.data.initial.extra,
    roomId: this.data.initial.roomId ?? '',
    temperature: this.data.initial.temperature ?? '',
    spinSpeed: this.data.initial.spinSpeed ?? '',
    description: this.data.initial.description ?? '',
  });
  readonly modalForm = form(this.model, (schema) => {
    required(schema.name, { message: 'Il nome è obbligatorio' });
    pattern(schema.sortOrder, /^$|^\d+$/, { message: 'L ordine deve contenere solo numeri' });
    if (this.data.isWashingProgram) {
      pattern(schema.temperature, /^$|^(?:[0-9]|[1-8][0-9]|9[0-5])$/, { message: 'Temperatura compresa tra 0 e 95' });
      pattern(schema.spinSpeed, /^$|^\d+$/, { message: 'La centrifuga deve essere maggiore o uguale a 0' });
    }
  });
  readonly attempted = signal(false);
  readonly colorPickerValue = computed(() => this.normalizeHexColor(this.modalForm.extra().value()));

  constructor(private readonly dialogRef: DialogRef<ReferenceEditorDialogResult | null>) {}

  close() {
    this.dialogRef.close(null);
  }

  confirm() {
    this.attempted.set(true);

    if (
      this.modalForm.name().invalid() ||
      this.modalForm.sortOrder().invalid() ||
      (this.data.isWashingProgram &&
        (this.modalForm.temperature().invalid() || this.modalForm.spinSpeed().invalid()))
    ) {
      return;
    }

    this.dialogRef.close({
      name: this.modalForm.name().value().trim(),
      sortOrder: this.modalForm.sortOrder().value().trim(),
      extra: this.modalForm.extra().value().trim(),
      roomId: this.modalForm.roomId().value() ? this.modalForm.roomId().value().trim() : null,
      temperature: this.data.isWashingProgram ? this.modalForm.temperature().value().trim() || null : null,
      spinSpeed: this.data.isWashingProgram ? this.modalForm.spinSpeed().value().trim() || null : null,
      description: this.data.isDetergent ? this.modalForm.description().value().trim() || null : null,
    });
  }

  showError(field: { invalid: () => boolean; touched: () => boolean; dirty: () => boolean }) {
    return field.invalid() && (field.touched() || field.dirty() || this.attempted());
  }

  firstError(field: { errors: () => Array<{ message?: string }> }) {
    return field.errors()[0]?.message ?? 'Valore non valido';
  }

  onColorPicked(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    this.modalForm.extra().value.set(color);
  }

  private normalizeHexColor(value: string) {
    const normalized = value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '#5a9de8';
  }
}
