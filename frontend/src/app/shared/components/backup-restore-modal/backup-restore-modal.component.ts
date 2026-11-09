import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api.service';
import { ToastService } from '../../../core/toast.service';
import { OfflineStorageService } from '../../../core/offline-storage.service';
import { ReferenceStoreService } from '../../../core/reference-store.service';
import { BackupStatsDto, RestoreResultDto } from '../../../core/models';
import { ButtonComponent } from '../button';

@Component({
  standalone: true,
  selector: 'app-backup-restore-modal',
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: './backup-restore-modal.component.html',
  styleUrl: './backup-restore-modal.component.scss',
})
export class BackupRestoreModalComponent implements OnInit {
  private readonly dialogRef = inject(DialogRef<boolean>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly storage = inject(OfflineStorageService, { optional: true });
  private readonly referenceStore = inject(ReferenceStoreService);

  readonly activeTab = signal<'export' | 'restore'>('export');
  readonly loadingStats = signal(true);
  readonly stats = signal<BackupStatsDto | null>(null);

  // Export state
  readonly downloading = signal(false);

  // Restore state
  readonly selectedFile = signal<File | null>(null);
  readonly restoreMode = signal<'replace' | 'merge'>('replace');
  readonly confirmReplace = signal(false);
  readonly restoring = signal(false);
  readonly restoreResult = signal<RestoreResultDto | null>(null);

  async ngOnInit() {
    await this.fetchStats();
  }

  async fetchStats() {
    this.loadingStats.set(true);
    try {
      const data = await firstValueFrom(this.api.getBackupStats());
      this.stats.set(data);
    } catch {
      this.toast.error('Impossibile caricare le statistiche del backup');
    } finally {
      this.loadingStats.set(false);
    }
  }

  setTab(tab: 'export' | 'restore') {
    this.activeTab.set(tab);
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async downloadBackup() {
    if (this.downloading()) return;

    this.downloading.set(true);
    try {
      const blob = await firstValueFrom(this.api.downloadBackupZip());
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `dressly-backup-${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      this.toast.success('Backup ZIP scaricato con successo');
    } catch {
      this.toast.error("Errore durante l'esportazione del backup");
    } finally {
      this.downloading.set(false);
    }
  }

  readonly MAX_RESTORE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB ceiling

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (!file.name.toLowerCase().endsWith('.zip')) {
        this.toast.error('Seleziona un file archivio valido con estensione .zip');
        return;
      }
      if (file.size > this.MAX_RESTORE_SIZE_BYTES) {
        this.toast.error('Il file selezionato supera la dimensione massima consentita di 2 GB');
        return;
      }
      this.selectedFile.set(file);
      this.restoreResult.set(null);
    }
  }

  canRestore(): boolean {
    if (!this.selectedFile() || this.restoring()) return false;
    if (this.restoreMode() === 'replace' && !this.confirmReplace()) {
      return false;
    }
    return true;
  }

  async startRestore() {
    const file = this.selectedFile();
    if (!file || !this.canRestore()) return;

    this.restoring.set(true);
    try {
      const result = await firstValueFrom(this.api.restoreBackupZip(file, this.restoreMode()));
      this.restoreResult.set(result);
      this.toast.success(
        `Ripristino completato! Importati ${result.stats.clothesCount} capi e ${result.stats.filesCount} file.`,
      );

      // Reset client cache and reload catalogs
      if (this.storage) {
        await this.storage.clearAllStores();
      }
      await this.referenceStore.loadAll({ silent: false });

      // Refresh stats
      await this.fetchStats();
    } catch (err: any) {
      let msg = err?.error?.message;
      if (!msg && err?.status === 413) {
        msg = 'Il file caricato supera la dimensione massima consentita (2 GB).';
      } else if (msg === 'File too large') {
        msg = 'Il file di backup supera la dimensione massima consentita di 2 GB.';
      }
      msg = msg || 'Errore durante il ripristino del backup';
      this.toast.error(msg);
    } finally {
      this.restoring.set(false);
    }
  }

  close(success = false) {
    this.dialogRef.close(success);
  }
}
