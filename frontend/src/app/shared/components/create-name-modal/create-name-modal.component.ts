import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormField, form, required } from '@angular/forms/signals';

export type CreateNameModalData = {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  requiredMessage: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

@Component({
  selector: 'app-create-name-modal',
  standalone: true,
  imports: [CommonModule, FormField],
  templateUrl: './create-name-modal.component.html',
  styleUrl: './create-name-modal.component.scss',
})
export class CreateNameModalComponent {
  readonly data = inject<CreateNameModalData>(DIALOG_DATA);
  readonly model = signal({ name: '' });
  readonly modalForm = form(this.model, (schema) => {
    required(schema.name, { message: this.data.requiredMessage });
  });
  readonly attempted = signal(false);

  constructor(private readonly dialogRef: DialogRef<string | null>) {}

  close() {
    this.dialogRef.close(null);
  }

  confirm() {
    this.attempted.set(true);
    if (this.modalForm.name().invalid()) {
      return;
    }

    const name = this.modalForm.name().value().trim();
    if (!name) {
      return;
    }

    this.dialogRef.close(name);
  }

  showError() {
    const field = this.modalForm.name();
    return field.invalid() && (field.touched() || field.dirty() || this.attempted());
  }

  errorMessage() {
    return this.modalForm.name().errors()[0]?.message ?? 'Valore non valido';
  }
}
