import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { OutfitDetailResponse } from '../../../../core/models';
import { OutfitGridComponent } from '../outfit-grid/outfit-grid.component';

export type OutfitSelectModalData = {
  clothesIds: string[];
};

@Component({
  selector: 'app-outfit-select-modal',
  standalone: true,
  imports: [CommonModule, OutfitGridComponent],
  templateUrl: './outfit-select-modal.component.html',
  styleUrl: './outfit-select-modal.component.scss',
})
export class OutfitSelectModalComponent {
  readonly data = inject<OutfitSelectModalData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<OutfitDetailResponse | null>);

  readonly clothesCount = this.data.clothesIds.length;

  close() {
    this.dialogRef.close(null);
  }

  onOutfitSelected(outfit: OutfitDetailResponse) {
    this.dialogRef.close(outfit);
  }

  onOutfitCreated(outfit: OutfitDetailResponse) {
    this.dialogRef.close(outfit);
  }
}

