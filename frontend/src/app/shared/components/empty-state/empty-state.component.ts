import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WashingIconComponent, IroningIconComponent, DryingIconComponent } from '../icons';

export type EmptyStateIcon =
  | 'washing'
  | 'ironing'
  | 'drying'
  | 'outfit'
  | 'clothes'
  | 'wardrobe'
  | 'custom'
  | 'none'
  | string;

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    WashingIconComponent,
    IroningIconComponent,
    DryingIconComponent,
  ],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly title = input<string>('');
  readonly description = input<string>('');
  readonly icon = input<EmptyStateIcon | null>('outfit');
  readonly actionText = input<string | null>('Vai al guardaroba');
  readonly actionRoute = input<string | any[] | null>(null);

  readonly action = output<void>();

  onActionClick(event: MouseEvent): void {
    this.action.emit();
  }
}

