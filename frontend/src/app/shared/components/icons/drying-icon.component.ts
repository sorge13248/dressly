import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-drying-icon',
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
      class="laundry-icon icon-drying"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="12" cy="13" r="5" />
      <path d="M9.8 13.2a2.3 2.3 0 0 1 4.4 0 2.3 2.3 0 0 1-4.4 0" />
      <circle cx="7" cy="6" r=".6" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="6" r=".6" fill="currentColor" stroke="none" />
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
export class DryingIconComponent {
  readonly size = input<number>(20);
  readonly strokeWidth = input<number>(1.8);
}
