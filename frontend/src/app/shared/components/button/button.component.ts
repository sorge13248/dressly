import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

@Component({
  selector: 'app-button, button[appButton], a[appButton]',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loading()) {
      <span class="btn-spinner" aria-hidden="true"></span>
    }
    <ng-content></ng-content>
  `,
  styleUrl: './button.component.scss',
  host: {
    '[class.app-btn]': 'true',
    '[class.btn-primary]': 'variant() === "primary"',
    '[class.btn-secondary]': 'variant() === "secondary"',
    '[class.btn-danger]': 'variant() === "danger"',
    '[class.btn-ghost]': 'variant() === "ghost"',
    '[class.btn-success]': 'variant() === "success"',
    '[class.btn-sm]': 'size() === "sm"',
    '[class.btn-md]': 'size() === "md"',
    '[class.btn-lg]': 'size() === "lg"',
    '[class.btn-icon]': 'size() === "icon"',
    '[class.btn-loading]': 'loading()',
    '[class.disabled]': 'isDisabled()',
    '[attr.type]': 'computedType()',
    '[attr.disabled]': 'isNativeDisabled()',
    '[attr.aria-disabled]': 'isDisabled()',
    '[attr.tabindex]': 'computedTabIndex()',
    '[attr.role]': 'computedRole()',
  },
})
export class ButtonComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly loading = input<boolean, unknown>(false, { transform: booleanAttribute });

  private readonly isNativeButton = this.elementRef.nativeElement.tagName.toLowerCase() === 'button';
  private readonly isCustomElement = this.elementRef.nativeElement.tagName.toLowerCase() === 'app-button';

  readonly isDisabled = computed(() => this.disabled() || this.loading());

  readonly computedType = computed(() => {
    return this.isNativeButton ? this.type() : null;
  });

  readonly isNativeDisabled = computed(() => {
    return this.isNativeButton && this.isDisabled() ? '' : null;
  });

  readonly computedTabIndex = computed(() => {
    if (!this.isCustomElement) {
      return null;
    }
    return this.isDisabled() ? -1 : 0;
  });

  readonly computedRole = computed(() => {
    return this.isCustomElement ? 'button' : null;
  });

  @HostListener('click', ['$event'])
  handleClick(event: MouseEvent) {
    if (this.isDisabled()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  @HostListener('keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (this.isCustomElement && (event.key === 'Enter' || event.key === ' ')) {
      if (this.isDisabled()) {
        event.preventDefault();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
      }
      this.elementRef.nativeElement.click();
    }
  }
}
