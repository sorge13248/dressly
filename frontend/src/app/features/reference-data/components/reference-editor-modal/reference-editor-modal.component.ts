import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormField, form, pattern, required } from '@angular/forms/signals';

type ReferenceEditorMode = 'create' | 'edit';

export type ReferenceEditorDialogData = {
  mode: ReferenceEditorMode;
  tabLabel: string;
  tabEmoji: string;
  extraLabel: string;
  showSortOrder: boolean;
  usesColorPicker: boolean;
  initial: {
    name: string;
    sortOrder: string;
    extra: string;
  };
};

export type ReferenceEditorDialogResult = {
  name: string;
  sortOrder: string;
  extra: string;
};

@Component({
  selector: 'app-reference-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, FormField],
  templateUrl: './reference-editor-modal.component.html',
  styleUrl: './reference-editor-modal.component.scss',
})
export class ReferenceEditorModalComponent {
  readonly data = inject<ReferenceEditorDialogData>(DIALOG_DATA);
  readonly model = signal({
    name: this.data.initial.name,
    sortOrder: this.data.initial.sortOrder,
    extra: this.data.initial.extra,
  });
  readonly modalForm = form(this.model, (schema) => {
    required(schema.name, { message: 'Il nome è obbligatorio' });
    pattern(schema.sortOrder, /^$|^\d+$/, { message: 'L ordine deve contenere solo numeri' });
  });
  readonly attempted = signal(false);
  readonly colorPickerValue = computed(() => this.normalizeHexColor(this.modalForm.extra().value()));

  constructor(private readonly dialogRef: DialogRef<ReferenceEditorDialogResult | null>) {}

  close() {
    this.dialogRef.close(null);
  }

  confirm() {
    this.attempted.set(true);

    if (this.modalForm.name().invalid() || this.modalForm.sortOrder().invalid()) {
      return;
    }

    this.dialogRef.close({
      name: this.modalForm.name().value().trim(),
      sortOrder: this.modalForm.sortOrder().value().trim(),
      extra: this.modalForm.extra().value().trim(),
    });
  }

  showError(field: ReturnType<typeof this.modalForm.name> | ReturnType<typeof this.modalForm.sortOrder>) {
    return field.invalid() && (field.touched() || field.dirty() || this.attempted());
  }

  firstError(field: ReturnType<typeof this.modalForm.name> | ReturnType<typeof this.modalForm.sortOrder>) {
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
