import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogRef } from '@angular/cdk/dialog';
import { ButtonComponent } from '../button';

@Component({
  selector: 'app-update-modal',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './update-modal.component.html',
  styleUrl: './update-modal.component.scss',
})
export class UpdateModalComponent {
  private readonly dialogRef = inject(DialogRef<boolean>);

  dismiss(): void {
    this.dialogRef.close(false);
  }

  reload(): void {
    this.dialogRef.close(true);
  }
}

