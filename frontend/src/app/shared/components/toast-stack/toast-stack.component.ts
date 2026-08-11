import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/toast.service';

@Component({
  selector: 'app-toast-stack',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-stack.component.html',
  styleUrl: './toast-stack.component.scss',
})
export class ToastStackComponent {
  readonly toastService = inject(ToastService);

  dismiss(id: string) {
    this.toastService.dismiss(id);
  }
}
