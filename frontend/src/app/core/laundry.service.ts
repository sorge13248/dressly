import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface LaundryCounterState {
  count: number;
  displayedCount: number;
  animating: 'idle' | 'slide-down' | 'slide-out-zero' | 'pop-up';
}

@Injectable({ providedIn: 'root' })
export class LaundryService {
  private readonly api = inject(ApiService);

  readonly washingState = signal<LaundryCounterState>({
    count: 0,
    displayedCount: 0,
    animating: 'idle',
  });

  readonly ironingState = signal<LaundryCounterState>({
    count: 0,
    displayedCount: 0,
    animating: 'idle',
  });

  readonly washingCount = computed(() => this.washingState().count);
  readonly ironingCount = computed(() => this.ironingState().count);

  private washingTimer: ReturnType<typeof setTimeout> | null = null;
  private ironingTimer: ReturnType<typeof setTimeout> | null = null;

  async refreshCounts(hintType?: 'washing' | 'ironing', hintAction?: 'add' | 'remove'): Promise<void> {
    try {
      const counts = await firstValueFrom(this.api.getLaundryCounts());
      const nextWash = counts?.washingCount ?? 0;
      const nextIron = counts?.ironingCount ?? 0;

      const washHint = hintType === 'washing' ? (hintAction === 'remove' ? 'slide-down' : 'pop-up') : undefined;
      const ironHint = hintType === 'ironing' ? (hintAction === 'remove' ? 'slide-down' : 'pop-up') : undefined;

      this.updateWashingCount(nextWash, washHint);
      this.updateIroningCount(nextIron, ironHint);
    } catch {
      // Ignore count fetch errors gracefully
    }
  }

  updateWashingCount(newCount: number, forceAnimation?: 'slide-down' | 'pop-up'): void {
    const current = this.washingState();
    if (newCount === current.count && !forceAnimation) {
      return;
    }

    if (this.washingTimer) {
      clearTimeout(this.washingTimer);
      this.washingTimer = null;
    }

    const isDecrement = forceAnimation === 'slide-down' || newCount < current.count;
    const isIncrement = forceAnimation === 'pop-up' || newCount > current.count;

    if (isDecrement) {
      const isReachingZero = newCount === 0;
      this.washingState.set({
        count: newCount,
        displayedCount: current.displayedCount > 0 ? current.displayedCount : newCount,
        animating: isReachingZero ? 'slide-out-zero' : 'slide-down',
      });

      this.washingTimer = setTimeout(() => {
        this.washingState.set({
          count: newCount,
          displayedCount: newCount,
          animating: 'idle',
        });
      }, 450);
    } else if (isIncrement) {
      this.washingState.set({
        count: newCount,
        displayedCount: newCount,
        animating: 'pop-up',
      });

      this.washingTimer = setTimeout(() => {
        this.washingState.update((s) => ({ ...s, animating: 'idle' }));
      }, 450);
    } else {
      this.washingState.set({
        count: newCount,
        displayedCount: newCount,
        animating: 'idle',
      });
    }
  }

  updateIroningCount(newCount: number, forceAnimation?: 'slide-down' | 'pop-up'): void {
    const current = this.ironingState();
    if (newCount === current.count && !forceAnimation) {
      return;
    }

    if (this.ironingTimer) {
      clearTimeout(this.ironingTimer);
      this.ironingTimer = null;
    }

    const isDecrement = forceAnimation === 'slide-down' || newCount < current.count;
    const isIncrement = forceAnimation === 'pop-up' || newCount > current.count;

    if (isDecrement) {
      const isReachingZero = newCount === 0;
      this.ironingState.set({
        count: newCount,
        displayedCount: current.displayedCount > 0 ? current.displayedCount : newCount,
        animating: isReachingZero ? 'slide-out-zero' : 'slide-down',
      });

      this.ironingTimer = setTimeout(() => {
        this.ironingState.set({
          count: newCount,
          displayedCount: newCount,
          animating: 'idle',
        });
      }, 450);
    } else if (isIncrement) {
      this.ironingState.set({
        count: newCount,
        displayedCount: newCount,
        animating: 'pop-up',
      });

      this.ironingTimer = setTimeout(() => {
        this.ironingState.update((s) => ({ ...s, animating: 'idle' }));
      }, 450);
    } else {
      this.ironingState.set({
        count: newCount,
        displayedCount: newCount,
        animating: 'idle',
      });
    }
  }

  setCounts(washing: number, ironing: number): void {
    this.updateWashingCount(washing);
    this.updateIroningCount(ironing);
  }

  setWashingCount(count: number): void {
    this.updateWashingCount(count);
  }

  setIroningCount(count: number): void {
    this.updateIroningCount(count);
  }

  async animateFlyToNav(
    source: HTMLElement | Event | null,
    targetType: 'washing' | 'ironing',
    action: 'add' | 'remove' = 'add',
  ): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }

    const sourceEl = source instanceof Event ? (source.currentTarget as HTMLElement) : source;
    const targetPath = targetType === 'washing' ? 'wardrobe/washing' : 'wardrobe/ironing';

    // Find target nav link
    const targetButtons = Array.from(document.querySelectorAll<HTMLElement>(`[data-nav-path="${targetPath}"]`));
    const visibleTarget = targetButtons.find((el) => el.offsetWidth > 0 && el.offsetHeight > 0);
    const targetEl = visibleTarget || document.querySelector<HTMLElement>('.nav-toggle') || targetButtons[0];

    if (!targetEl) {
      return;
    }

    // Find source image or visual element
    const sourceImg = this.findSourceImage(sourceEl);
    if (!sourceImg) {
      this.triggerTargetFeedback(targetEl);
      return;
    }

    const sourceRect = sourceImg.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    if (sourceRect.width === 0 || sourceRect.height === 0 || targetRect.width === 0 || targetRect.height === 0) {
      this.triggerTargetFeedback(targetEl);
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.triggerTargetFeedback(targetEl);
      return;
    }

    // Clone element
    const clone = document.createElement(sourceImg instanceof HTMLImageElement ? 'img' : 'div');
    if (sourceImg instanceof HTMLImageElement) {
      (clone as HTMLImageElement).src = sourceImg.src;
    } else {
      clone.textContent = sourceImg.textContent?.trim().slice(0, 15) || '👗';
      clone.style.display = 'flex';
      clone.style.alignItems = 'center';
      clone.style.justifyContent = 'center';
      clone.style.background = 'linear-gradient(135deg, #38bdf8, #1e40af)';
      clone.style.color = '#fff';
      clone.style.fontWeight = 'bold';
    }

    clone.className = 'dressly-flying-thumb';
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${sourceRect.left}px`,
      top: `${sourceRect.top}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      objectFit: 'cover',
      borderRadius: '14px',
      boxShadow: '0 12px 30px rgba(0, 30, 80, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.9)',
      pointerEvents: 'none',
      zIndex: '999999',
      margin: '0',
      transformOrigin: 'center center',
      willChange: 'transform, opacity, border-radius',
    });

    document.body.appendChild(clone);

    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    const deltaX = endX - startX;
    const deltaY = endY - startY;

    const targetScale = Math.max(0.12, Math.min(0.35, 36 / Math.max(sourceRect.width, 1)));
    const midX = deltaX * 0.52;
    const midY = deltaY * 0.45 - 28;
    const midScale = Math.max(targetScale * 1.6, 0.5);

    if (typeof clone.animate !== 'function') {
      clone.remove();
      this.triggerTargetFeedback(targetEl);
      return;
    }

    try {
      const anim = clone.animate(
        [
          {
            transform: 'translate(0px, 0px) scale(1) rotate(0deg)',
            opacity: 1,
            borderRadius: '14px',
            filter: 'brightness(1)',
          },
          {
            transform: `translate(${midX}px, ${midY}px) scale(${midScale}) rotate(${deltaX > 0 ? 5 : -5}deg)`,
            opacity: 0.95,
            borderRadius: '24px',
            filter: 'brightness(1.1)',
            offset: 0.5,
          },
          {
            transform: `translate(${deltaX}px, ${deltaY}px) scale(${targetScale}) rotate(0deg)`,
            opacity: 0.5,
            borderRadius: '50%',
            filter: 'brightness(1.25) drop-shadow(0 0 8px rgba(56, 189, 248, 0.9))',
          },
        ],
        {
          duration: 550,
          easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)',
          fill: 'forwards',
        },
      );

      await new Promise<void>((resolve) => {
        anim.onfinish = () => resolve();
        anim.oncancel = () => resolve();
      });
    } finally {
      clone.remove();
      this.triggerTargetFeedback(targetEl);
    }
  }

  private findSourceImage(source: HTMLElement | null): HTMLElement | null {
    if (!source) {
      return document.querySelector('.hero-photo img, .item-card img');
    }

    if (source instanceof HTMLImageElement) {
      return source;
    }

    const card = source.closest('.item-card, .laundry-card, .hero-row, .detail-shell');
    if (card) {
      const img = card.querySelector<HTMLImageElement>('img');
      if (img && img.offsetWidth > 0) return img;
      const fallback = card.querySelector<HTMLElement>('.thumb-fallback, .hero-photo--empty, .thumb');
      if (fallback) return fallback;
    }

    const insideImg = source.querySelector<HTMLImageElement>('img');
    if (insideImg) return insideImg;

    return document.querySelector<HTMLElement>('.hero-photo img, .item-card img, .thumb-fallback') || source;
  }

  private triggerTargetFeedback(targetEl: HTMLElement): void {
    targetEl.classList.remove('nav-pill-target-hit');
    void targetEl.offsetWidth; // Force reflow
    targetEl.classList.add('nav-pill-target-hit');
    setTimeout(() => {
      targetEl.classList.remove('nav-pill-target-hit');
    }, 550);
  }
}
