import { Injectable, inject, isDevMode, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { UpdateModalComponent } from '../shared/components/update-modal';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly dialog = inject(Dialog);

  readonly updateAvailable = signal(false);

  private registration: ServiceWorkerRegistration | null = null;
  private waitingWorker: ServiceWorker | null = null;
  private isDialogOpen = false;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;

  init(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // In development mode (ng serve / localhost), do not register the service worker
    // and actively unregister any leftover service workers to prevent interfering with HMR.
    if (isDevMode()) {
      this.cleanupDevServiceWorker();
      return;
    }

    // Register service worker and bind lifecycle listeners in production
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        this.handleRegistration(reg);
      })
      .catch((err) => {
        console.warn('[PWA] Service worker registration error:', err);
      });
  }

  private cleanupDevServiceWorker(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {});
      }
    });

    if (typeof caches !== 'undefined') {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name).catch(() => {});
        }
      });
    }
  }

  handleRegistration(reg: ServiceWorkerRegistration): void {
    this.registration = reg;

    // 1. If an updated worker is already waiting, prompt immediately
    if (reg.waiting && navigator.serviceWorker.controller) {
      this.onUpdateReady(reg.waiting);
      return;
    }

    // 2. Listen for incoming updates
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) {
        return;
      }

      newWorker.addEventListener('statechange', () => {
        // Only trigger if worker has finished installing and an existing controller is currently active
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.onUpdateReady(newWorker);
        }
      });
    });

    // 3. Periodic check every 20 minutes
    if (!this.checkIntervalId) {
      this.checkIntervalId = setInterval(() => {
        this.checkForUpdate();
      }, 20 * 60 * 1000);
    }

    // 4. Check whenever the user returns to the app / tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkForUpdate();
      }
    });

    // 5. Check when coming back online
    window.addEventListener('online', () => {
      this.checkForUpdate();
    });

    // 6. Perform initial update check
    this.checkForUpdate();
  }

  async checkForUpdate(): Promise<void> {
    if (!this.registration) {
      return;
    }

    try {
      await this.registration.update();
    } catch {
      // Ignored: network failure or offline
    }
  }

  onUpdateReady(worker: ServiceWorker): void {
    this.waitingWorker = worker;
    this.updateAvailable.set(true);
    this.promptUpdate();
  }

  promptUpdate(): void {
    if (this.isDialogOpen) {
      return;
    }

    this.isDialogOpen = true;
    const dialogRef = this.dialog.open<boolean>(UpdateModalComponent, {
      disableClose: false,
      hasBackdrop: true,
    });

    dialogRef.closed.subscribe((shouldReload) => {
      this.isDialogOpen = false;
      if (shouldReload) {
        this.applyUpdate();
      }
    });
  }

  applyUpdate(): void {
    let reloaded = false;
    const executeReload = () => {
      if (!reloaded) {
        reloaded = true;
        this.reloadWindow();
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', executeReload);
    }

    if (this.waitingWorker) {
      this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }

    // Safety fallback: if controllerchange doesn't fire within 700ms, reload anyway
    setTimeout(executeReload, 700);
  }

  protected reloadWindow(): void {
    window.location.reload();
  }
}

