import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

type WardrobePhotoLightboxData = {
  src: string;
  alt: string;
  title?: string | null;
};

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './photo-lightbox-modal.component.html',
  styleUrl: './photo-lightbox-modal.component.scss',
})
export class WardrobePhotoLightboxModalComponent {
  readonly data = inject<WardrobePhotoLightboxData>(DIALOG_DATA);

  constructor(private readonly dialogRef: DialogRef<void>) {}

  close() {
    this.dialogRef.close();
  }
}