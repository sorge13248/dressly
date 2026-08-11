import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export type ConfirmModalData = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-modal.component.html',
  styleUrl: './confirm-modal.component.scss',
})
export class ConfirmModalComponent {
  readonly data = inject<ConfirmModalData>(DIALOG_DATA);

  constructor(private readonly dialogRef: DialogRef<boolean>) {}

  close() {
    this.dialogRef.close(false);
  }

  confirm() {
    this.dialogRef.close(true);
  }
}
