import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { SyncService } from '../../../core/sync.service';
import { ToastService } from '../../../core/toast.service';
import { ConfirmModalComponent } from '../confirm-modal/confirm-modal.component';

@Component({
  selector: 'app-sync-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sync-indicator.component.html',
  styleUrl: './sync-indicator.component.scss',
})
export class SyncIndicatorComponent {
  private readonly elementRef = inject(ElementRef);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly syncService = inject(SyncService);

  readonly dropdownOpen = signal(false);

  readonly status = computed(() => this.syncService.status());
  readonly pendingCount = computed(() => this.syncService.pendingCount());
  readonly conflicts = computed(() => this.syncService.conflicts());
  readonly isOnline = computed(() => this.syncService.isOnline());
  readonly lastSyncTime = computed(() => this.syncService.lastSyncTime());

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
    switch (this.status()) {
      case 'syncing':
        return 'Sincronizzazione in corso...';
      case 'online-ok':
        return 'In linea (Sincronizzato)';
      case 'offline':
        return 'Disconnesso (offline)';
      case 'conflict':
        return 'Conflitto di sincronizzazione';
    }
  });

  readonly tooltip = computed(() => {
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
    }
  });

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
    try {
      await this.syncService.sync();
      this.toast.success('Sincronizzazione completata');
    } catch {
      this.toast.error('Errore durante la sincronizzazione');
    }
  }

  async onDownloadServerVersion(): Promise<void> {
    this.closeDropdown();

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
      await this.syncService.downloadServerVersion();
      this.toast.success('Versione del server scaricata con successo');
    } catch {
      this.toast.error('Errore durante il download dal server');
    }
  }
}

