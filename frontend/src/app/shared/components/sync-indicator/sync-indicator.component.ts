import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { SyncService } from '../../../core/sync.service';
import { ToastService } from '../../../core/toast.service';
import { ConfirmModalComponent } from '../confirm-modal/confirm-modal.component';
import { SyncStatus } from '../../../core/models';

@Component({
  selector: 'app-sync-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sync-indicator.component.html',
  styleUrl: './sync-indicator.component.scss',
})
export class SyncIndicatorComponent implements OnDestroy {
  private readonly elementRef = inject(ElementRef);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly syncService = inject(SyncService);

  readonly dropdownOpen = signal(false);
  readonly showSuccessCheckmark = signal(false);

  private successTimer: ReturnType<typeof setTimeout> | null = null;
  private previousStatus: SyncStatus | null = null;

  readonly status = computed(() => this.syncService.status());
  readonly pendingCount = computed(() => this.syncService.pendingCount());
  readonly conflicts = computed(() => this.syncService.conflicts());
  readonly isOnline = computed(() => this.syncService.isOnline());
  readonly lastSyncTime = computed(() => this.syncService.lastSyncTime());
  readonly lastError = computed(() => this.syncService.lastError());

  readonly formattedLastSync = computed(() => {
    const time = this.lastSyncTime();
    if (!time) {
      return 'Mai';
    }
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(time);
  });

  readonly statusLabel = computed(() => {
    if (this.showSuccessCheckmark() && this.status() === 'online-ok') {
      return 'Sincronizzato ora!';
    }
    switch (this.status()) {
      case 'syncing':
        return 'Sincronizzazione in corso...';
      case 'online-ok':
        return 'In linea (Sincronizzato)';
      case 'offline':
        return 'Disconnesso (offline)';
      case 'conflict':
        return 'Conflitto di sincronizzazione';
      case 'error':
        return this.lastError() || 'Errore di sincronizzazione';
    }
  });

  readonly tooltip = computed(() => {
    if (this.showSuccessCheckmark() && this.status() === 'online-ok') {
      return 'Sincronizzazione completata con successo!';
    }

    const s = this.status();
    const pending = this.pendingCount();
    const pendingStr = pending > 0 ? ` (${pending} modifiche in attesa)` : '';

    switch (s) {
      case 'syncing':
        return `Sincronizzazione in corso...${pendingStr}`;
      case 'online-ok':
        return `Sincronizzazione in linea: OK${pendingStr}`;
      case 'offline':
        return `Connessione assente (offline)${pendingStr}`;
      case 'conflict':
        return `Conflitto di sincronizzazione!${pendingStr}`;
      case 'error': {
        const err = this.lastError();
        return `${err || 'Errore di sincronizzazione'}${pendingStr}`;
      }
    }
  });

  constructor() {
    effect(() => {
      const current = this.status();
      const prev = this.previousStatus;
      this.previousStatus = current;

      if (current === 'error' || current === 'conflict' || current === 'offline') {
        untracked(() => {
          if (this.successTimer) {
            clearTimeout(this.successTimer);
            this.successTimer = null;
          }
          this.showSuccessCheckmark.set(false);
        });
      } else if (prev === 'syncing' && current === 'online-ok') {
        untracked(() => {
          this.triggerSuccessCheckmark();
        });
      }
    });
  }

  triggerSuccessCheckmark(): void {
    if (this.status() === 'error' || this.status() === 'conflict' || this.status() === 'offline') {
      this.showSuccessCheckmark.set(false);
      return;
    }
    if (this.successTimer) {
      clearTimeout(this.successTimer);
      this.successTimer = null;
    }
    this.showSuccessCheckmark.set(true);
    this.successTimer = setTimeout(() => {
      this.showSuccessCheckmark.set(false);
      this.successTimer = null;
    }, 3000);
  }

  toggleDropdown(event?: Event): void {
    event?.stopPropagation();
    this.dropdownOpen.update((open) => !open);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDropdown();
  }

  async onSyncNow(): Promise<void> {
    this.closeDropdown();
    this.showSuccessCheckmark.set(false);
    if (this.successTimer) {
      clearTimeout(this.successTimer);
      this.successTimer = null;
    }

    try {
      const res = await this.syncService.sync();
      if (!res) {
        this.showSuccessCheckmark.set(false);
        if (this.status() === 'offline') {
          this.toast.error('Impossibile sincronizzare: dispositivo offline');
        } else if (this.status() === 'conflict') {
          this.toast.error('Rilevato conflitto di sincronizzazione');
        } else {
          this.toast.error(this.lastError() || 'Errore durante la sincronizzazione');
        }
        return;
      }

      if (this.status() === 'conflict') {
        this.showSuccessCheckmark.set(false);
        this.toast.error('Rilevato conflitto di sincronizzazione');
        return;
      }

      this.toast.success('Sincronizzazione completata');
      this.triggerSuccessCheckmark();
    } catch {
      this.showSuccessCheckmark.set(false);
      this.toast.error(this.lastError() || 'Errore durante la sincronizzazione');
    }
  }

  async onDownloadServerVersion(): Promise<void> {
    this.closeDropdown();
    this.showSuccessCheckmark.set(false);
    if (this.successTimer) {
      clearTimeout(this.successTimer);
      this.successTimer = null;
    }

    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Scaricare la versione dal server?',
        message:
          'Questa operazione sostituirà tutti i dati locali con l\'ultima versione presente sul server. Eventuali modifiche locali non sincronizzate andranno perse. Vuoi continuare?',
        confirmLabel: 'Scarica dal server',
        cancelLabel: 'Annulla',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (!confirmed) {
      return;
    }

    try {
      const res = await this.syncService.downloadServerVersion();
      if (!res || this.status() === 'error' || this.status() === 'offline') {
        this.showSuccessCheckmark.set(false);
        this.toast.error(this.lastError() || 'Errore durante il download dal server');
        return;
      }
      this.toast.success('Versione del server scaricata con successo');
      this.triggerSuccessCheckmark();
    } catch {
      this.showSuccessCheckmark.set(false);
      this.toast.error(this.lastError() || 'Errore durante il download dal server');
    }
  }

  ngOnDestroy(): void {
    if (this.successTimer) {
      clearTimeout(this.successTimer);
      this.successTimer = null;
    }
  }
}
