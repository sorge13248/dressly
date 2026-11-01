import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { OutfitGridComponent } from '../../components/outfit-grid/outfit-grid.component';

@Component({
  selector: 'app-outfits-page',
  standalone: true,
  imports: [CommonModule, OutfitGridComponent],
  templateUrl: './outfits-page.component.html',
  styleUrl: './outfits-page.component.scss',
})
export class OutfitsPageComponent {}

