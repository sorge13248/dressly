import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'error';

export type AppToast = {
  id: string;
  message: string;
  tone: ToastTone;
  leaving: boolean;
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<AppToast[]>([]);

  show(message: string, tone: ToastTone = 'info', durationMs = 3200) {
    const normalized = message.trim();
    if (!normalized) {
      return;
    }

    const toast: AppToast = {
      id: crypto.randomUUID(),
      message: normalized,
      tone,
      leaving: false,
    };

    this.toasts.update((current) => [...current, toast]);

    if (durationMs > 0) {
      window.setTimeout(() => this.dismiss(toast.id), durationMs);
    }
  }

  info(message: string, durationMs = 3000) {
    this.show(message, 'info', durationMs);
  }

  success(message: string, durationMs = 2600) {
    this.show(message, 'success', durationMs);
  }

  error(message: string, durationMs = 4200) {
    this.show(message, 'error', durationMs);
  }

  dismiss(id: string) {
    let marked = false;
    this.toasts.update((current) =>
      current.map((toast) => {
        if (toast.id !== id || toast.leaving) {
          return toast;
        }
        marked = true;
        return { ...toast, leaving: true };
      }),
    );

    if (!marked) {
      return;
    }

    window.setTimeout(() => {
      this.toasts.update((current) => current.filter((toast) => toast.id !== id));
    }, 220);
  }
}
