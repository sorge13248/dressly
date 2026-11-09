import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-window-frame, app-window-shell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './window-frame.component.html',
  styleUrl: './window-frame.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WindowFrameComponent {
  /**
   * Title text displayed in the titlebar.
   * If omitted, the `[window-title]` projection slot will be rendered instead.
   */
  readonly title = input<string>('');

  /**
   * Optional badge / subtitle text shown next to the title.
   * If omitted, the `[window-subtitle]` projection slot can be used.
   */
  readonly subtitle = input<string>('');

  /**
   * Optional icon emoji or string fallback if not using `[window-icon]` projection.
   */
  readonly icon = input<string>('');

  /**
   * Whether to display the icon badge in the titlebar.
   */
  readonly showIcon = input<boolean>(true);

  /**
   * Whether to display the close button in the titlebar.
   */
  readonly showClose = input<boolean>(true);

  /**
   * Tooltip (title attribute) for the close button.
   */
  readonly closeTooltip = input<string>('Chiudi');

  /**
   * Accessible aria-label for the close button.
   */
  readonly closeAriaLabel = input<string>('Chiudi');

  /**
   * Maximum width of the window frame (e.g. '1120px', '940px', '100%').
   */
  readonly maxWidth = input<string>('1120px');

  /**
   * Custom inline padding for the outer shell if needed.
   */
  readonly shellPadding = input<string | null>(null);

  /**
   * Additional CSS classes for the outer window shell.
   */
  readonly shellClass = input<string>('');

  /**
   * Additional CSS classes for the window frame card.
   */
  readonly windowClass = input<string>('');

  /**
   * Emitted when the user clicks the close button.
   */
  readonly close = output<void>();

  onClose(): void {
    this.close.emit();
  }
}
