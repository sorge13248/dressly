import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class ModalScrollLockService {
  private readonly document = inject(DOCUMENT);
  private initialized = false;

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.isModalOpen()) {
      return;
    }

    if (!this.canScrollTarget(event.target, event.deltaY)) {
      event.preventDefault();
    }
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.isModalOpen()) {
      return;
    }

    if (!this.isInsideScrollable(event.target)) {
      event.preventDefault();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    if (!scrollKeys.includes(event.key)) {
      return;
    }

    if (!this.isModalOpen()) {
      return;
    }

    const activeEl = this.document.activeElement;
    const isTextInput =
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement ||
      activeEl instanceof HTMLSelectElement;

    if (isTextInput) {
      return;
    }

    if (!this.isInsideModalPane(activeEl)) {
      event.preventDefault();
    }
  };

  init(): void {
    if (this.initialized) {
      return;
    }
    const win = this.document.defaultView;
    if (!win) {
      return;
    }

    win.addEventListener('wheel', this.onWheel, { passive: false });
    win.addEventListener('touchmove', this.onTouchMove, { passive: false });
    win.addEventListener('keydown', this.onKeyDown, { passive: false });
    this.initialized = true;
  }

  destroy(): void {
    if (!this.initialized) {
      return;
    }
    const win = this.document.defaultView;
    if (win) {
      win.removeEventListener('wheel', this.onWheel);
      win.removeEventListener('touchmove', this.onTouchMove);
      win.removeEventListener('keydown', this.onKeyDown);
    }
    this.initialized = false;
  }

  private isModalOpen(): boolean {
    return Boolean(
      this.document.querySelector(
        '.cdk-overlay-dark-backdrop, .cdk-overlay-backdrop-showing:not(.cdk-overlay-transparent-backdrop)',
      ),
    );
  }

  private isInsideModalPane(target: EventTarget | null): boolean {
    let el = target instanceof HTMLElement ? target : null;
    while (el && el !== this.document.body && el !== this.document.documentElement) {
      if (el.classList.contains('cdk-overlay-pane')) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  private isInsideScrollable(target: EventTarget | null): boolean {
    let el = target instanceof HTMLElement ? target : null;
    while (el && el !== this.document.body && el !== this.document.documentElement) {
      if (el.classList.contains('cdk-overlay-pane')) {
        return this.hasScrollableOverflow(el);
      }
      if (this.hasScrollableOverflow(el)) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  private canScrollTarget(target: EventTarget | null, deltaY: number): boolean {
    let el = target instanceof HTMLElement ? target : null;
    while (el && el !== this.document.body && el !== this.document.documentElement) {
      if (el.classList.contains('cdk-overlay-pane')) {
        return this.canElementScroll(el, deltaY);
      }
      if (this.hasScrollableOverflow(el)) {
        return this.canElementScroll(el, deltaY);
      }
      el = el.parentElement;
    }
    return false;
  }

  private hasScrollableOverflow(el: HTMLElement): boolean {
    const win = this.document.defaultView;
    if (!win) {
      return false;
    }
    const style = win.getComputedStyle(el);
    const hasScroll = style.overflowY === 'auto' || style.overflowY === 'scroll';
    return hasScroll && el.scrollHeight > el.clientHeight;
  }

  private canElementScroll(el: HTMLElement, deltaY: number): boolean {
    if (!this.hasScrollableOverflow(el)) {
      return false;
    }
    // Scrolling down: can scroll if not at the bottom
    if (deltaY > 0 && Math.ceil(el.scrollTop + el.clientHeight) < el.scrollHeight) {
      return true;
    }
    // Scrolling up: can scroll if not at the top
    if (deltaY < 0 && el.scrollTop > 0) {
      return true;
    }
    return false;
  }
}
