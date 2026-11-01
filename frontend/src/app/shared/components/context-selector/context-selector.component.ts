import { CommonModule } from '@angular/common';
import { Component, inject, input, model, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ReferenceStoreService } from '../../../core/reference-store.service';
import { ButtonComponent } from '../button';
import { CreateNameModalComponent } from '../create-name-modal/create-name-modal.component';

@Component({
  selector: 'app-context-selector',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './context-selector.component.html',
  styleUrl: './context-selector.component.scss',
})
export class ContextSelectorComponent {
  readonly referenceStore = inject(ReferenceStoreService);
  private readonly dialog = inject(Dialog);

  // Models (two-way binding)
  readonly seasonIds = model<string[]>([]);
  readonly temperatureIds = model<string[]>([]);
  readonly useCaseIds = model<string[]>([]);

  // Configuration inputs
  readonly requiredSeasons = input<boolean>(true);
  readonly requiredTemperatures = input<boolean>(true);
  readonly requiredUseCases = input<boolean>(false);
  readonly allowCreation = input<boolean>(true);

  readonly seasonLabel = input<string>('Stagioni');
  readonly temperatureLabel = input<string>('Temperature');
  readonly useCaseLabel = input<string>('Occasioni');

  readonly showErrors = input<boolean>(false);
  readonly seasonError = input<string | null>(null);
  readonly temperatureError = input<string | null>(null);
  readonly useCaseError = input<string | null>(null);

  // Busy states for creation modals
  readonly quickSeasonBusy = signal(false);
  readonly quickTemperatureBusy = signal(false);
  readonly quickUseCaseBusy = signal(false);

  toggleSeason(id: string) {
    const current = this.seasonIds();
    if (current.includes(id)) {
      this.seasonIds.set(current.filter((item) => item !== id));
    } else {
      this.seasonIds.set([...current, id]);
    }
  }

  toggleTemperature(id: string) {
    const current = this.temperatureIds();
    if (current.includes(id)) {
      this.temperatureIds.set(current.filter((item) => item !== id));
    } else {
      this.temperatureIds.set([...current, id]);
    }
  }

  toggleUseCase(id: string) {
    const current = this.useCaseIds();
    if (current.includes(id)) {
      this.useCaseIds.set(current.filter((item) => item !== id));
    } else {
      this.useCaseIds.set([...current, id]);
    }
  }

  async openCreateSeasonModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Nuova stagione',
        description: 'Inserisci il nome della stagione da creare.',
        label: 'Nome stagione',
        placeholder: 'Es. Mezza stagione',
        requiredMessage: 'Inserisci il nome della stagione',
        confirmLabel: 'Crea',
      },
    });

    const name = await firstValueFrom(dialogRef.closed);
    if (!name?.trim()) return;

    this.quickSeasonBusy.set(true);
    try {
      const created = await this.referenceStore.create('seasons', {
        name: name.trim(),
      });
      if (created?.id) {
        const current = this.seasonIds();
        if (!current.includes(created.id)) {
          this.seasonIds.set([...current, created.id]);
        }
      }
    } finally {
      this.quickSeasonBusy.set(false);
    }
  }

  async openCreateTemperatureModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Nuova temperatura',
        description: 'Inserisci il nome della temperatura da creare.',
        label: 'Nome temperatura',
        placeholder: 'Es. Molto freddo',
        requiredMessage: 'Inserisci il nome della temperatura',
        confirmLabel: 'Crea',
      },
    });

    const name = await firstValueFrom(dialogRef.closed);
    if (!name?.trim()) return;

    this.quickTemperatureBusy.set(true);
    try {
      const created = await this.referenceStore.create('temperatures', {
        name: name.trim(),
      });
      if (created?.id) {
        const current = this.temperatureIds();
        if (!current.includes(created.id)) {
          this.temperatureIds.set([...current, created.id]);
        }
      }
    } finally {
      this.quickTemperatureBusy.set(false);
    }
  }

  async openCreateUseCaseModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Nuova occasione',
        description: "Inserisci il nome dell'occasione da creare.",
        label: 'Nome occasione',
        placeholder: 'Es. Cerimonia',
        requiredMessage: "Inserisci il nome dell'occasione",
        confirmLabel: 'Crea',
      },
    });

    const name = await firstValueFrom(dialogRef.closed);
    if (!name?.trim()) return;

    this.quickUseCaseBusy.set(true);
    try {
      const created = await this.referenceStore.create('use-cases', {
        name: name.trim(),
      });
      if (created?.id) {
        const current = this.useCaseIds();
        if (!current.includes(created.id)) {
          this.useCaseIds.set([...current, created.id]);
        }
      }
    } finally {
      this.quickUseCaseBusy.set(false);
    }
  }
}

