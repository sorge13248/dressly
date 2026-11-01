import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-ironing-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.width.px]="size()"
      [style.height.px]="size()"
      class="laundry-icon icon-ironing"
      aria-hidden="true"
    >
      <path d="M5 8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2" />
      <path d="M3 17h17a2 2 0 0 0 1.8-2.9L19 9H4a2 2 0 0 0-2 2v5a1 1 0 0 0 1 1z" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      vertical-align: middle;
    }
    svg {
      display: block;
      flex-shrink: 0;
    }
  `,
})
export class IroningIconComponent {
  readonly size = input<number>(20);
  readonly strokeWidth = input<number>(1.8);
}
