import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-aero-spinner',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
})
export class AeroSpinnerComponent {
  @Input() title = 'Dressly';
  @Input() message = 'Connessione sicura in corso...';
  @Input() fullscreen = false;
}
