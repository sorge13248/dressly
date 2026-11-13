import { CommonModule, Location } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormField, form, max, min, minLength, pattern } from '@angular/forms/signals';
import { ActivatedRoute, CanDeactivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { SyncService } from '../../../../core/sync.service';
import { ClothesItem, ClothesStatus } from '../../../../core/models';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { ToastService } from '../../../../core/toast.service';
import { SelectDropdownComponent, SelectDropdownOption } from '../../../../shared/components/select-dropdown/select-dropdown.component';
import { CreateNameModalComponent } from '../../../../shared/components/create-name-modal/create-name-modal.component';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { WashingIconComponent, DryingIconComponent, IroningIconComponent } from '../../../../shared/components/icons';
import { ContextSelectorComponent } from '../../../../shared/components/context-selector/context-selector.component';
import { normalizeHexColor } from '../../../../shared/utils/color.utils';
import { generateRandomTagCode, normalizeTagCode } from '../../../../shared/utils/tag-code.utils';
import { WindowFrameComponent } from '../../../../shared/components/window-frame';

export type StepIndex = 1 | 2 | 3 | 4 | 5;

export type WizardPhotoItem = {
  id: string;
  source: 'existing' | 'pending';
  file?: File;
  previewUrl: string;
  name: string;
  uploadFailed?: boolean;
  errorMessage?: string;
};

export function extractUploadErrorMessage(err: unknown, file?: File): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 413) {
      const sizeMb = file ? (file.size / (1024 * 1024)).toFixed(1) + 'MB' : '';
      return `File troppo grande${sizeMb ? ` (${sizeMb})` : ''}: il limite massimo consentito è 10MB`;
    }
    if (err.status === 0) {
      return 'Errore di connessione o rete non disponibile';
    }
    if (err.status === 401 || err.status === 403) {
      return 'Sessione scaduta o non autorizzata';
    }
    if (err.status === 404) {
      return 'Capo non trovato sul server';
    }
    if (err.error) {
      if (typeof err.error === 'string') {
        return err.error;
      }
      if (typeof err.error.message === 'string') {
        return err.error.message;
      }
      if (Array.isArray(err.error.message)) {
        return err.error.message.join(', ');
      }
    }
    if (err.status >= 500) {
      return `Errore interno del server (${err.status})`;
    }
    return `Errore HTTP ${err.status}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Errore imprevisto durante il caricamento';
}

export function extractApiErrorMessage(err: unknown, fallback = 'Errore durante il salvataggio del capo'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Errore di connessione o rete non disponibile';
    }
    if (err.status === 401 || err.status === 403) {
      return 'Sessione scaduta o non autorizzata';
    }
    if (err.status === 404) {
      return 'Capo non trovato sul server';
    }
    if (err.error) {
      if (typeof err.error === 'string') {
        return err.error;
      }
      if (typeof err.error.message === 'string') {
        return err.error.message;
      }
      if (Array.isArray(err.error.message)) {
        return err.error.message.join(', ');
      }
    }
    if (err.status >= 500) {
      return `Errore interno del server (${err.status})`;
    }
    return `Errore HTTP ${err.status}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}

type WizardWashingForm = {
  wash_type: 'do_not_wash' | 'hand_wash_only' | 'washer_ok';
  bleach_type: 'no_bleach' | 'non_chlorine_bleach' | 'any_bleach';
  stretch: boolean;
  washing_program_id: string | null;
  washing_temperature: number | null;
  detergent_id: string | null;
  reverse_washing: boolean;
  closed_zips: boolean;
  similar_colors: boolean;
  wash_separately: boolean;
  use_color_catcher: boolean;
  color_loss: number | null;
  color_loss_test_temperature: number | null;
  notes: string;
};

type WizardDryingForm = {
  tumble_dry: boolean;
  tumble_dry_temperature: 'low' | 'medium' | 'high' | '';
};

type WizardIroningForm = {
  iron_type: 'yes' | 'without_steam' | 'no';
  ironing_temperature: number | null;
  inside_out: boolean;
};

type WizardBuyForm = {
  shop_name: string;
  shop_url: string;
  purchase_date: string;
};

type WizardFormModel = {
  base: {
    name: string;
    code: string;
    status: ClothesStatus;
    location_id: string;
    size: string;
    fit_id: string;
    brand_id: string;
    type_id: string;
    notes: string;
    is_cumulative: boolean;
    quantity: number;
  };
  style: {
    color_ids: string[];
    material_ids: string[];
    tag_ids: string[];
  };
  context: {
    season_ids: string[];
    temperature_ids: string[];
    use_case_ids: string[];
  };
  care: {
    washingEnabled: boolean;
    washing: WizardWashingForm;
    dryingEnabled: boolean;
    drying: WizardDryingForm;
    ironingEnabled: boolean;
    ironing: WizardIroningForm;
  };
  buy: {
    buyEnabled: boolean;
    detail: WizardBuyForm;
  };
};

const createInitialWizardModel = (): WizardFormModel => ({
  base: {
    name: '',
    code: generateRandomTagCode(),
    status: 'in_wardrobe',
    location_id: '',
    size: '',
    fit_id: '',
    brand_id: '',
    type_id: '',
    notes: '',
    is_cumulative: false,
    quantity: 1,
  },
  style: {
    color_ids: [],
    material_ids: [],
    tag_ids: [],
  },
  context: {
    season_ids: [],
    temperature_ids: [],
    use_case_ids: [],
  },
  care: {
    washingEnabled: false,
    washing: {
      wash_type: 'washer_ok',
      bleach_type: 'no_bleach',
      stretch: false,
      washing_program_id: null,
      washing_temperature: null,
      detergent_id: null,
      reverse_washing: false,
      closed_zips: false,
      similar_colors: false,
      wash_separately: false,
      use_color_catcher: false,
      color_loss: null,
      color_loss_test_temperature: null,
      notes: '',
    },
    dryingEnabled: false,
    drying: {
      tumble_dry: false,
      tumble_dry_temperature: '',
    },
    ironingEnabled: false,
    ironing: {
      iron_type: 'yes',
      ironing_temperature: null,
      inside_out: false,
    },
  },
  buy: {
    buyEnabled: false,
    detail: {
      shop_name: '',
      shop_url: '',
      purchase_date: '',
    },
  },
});

const steps = [
  { index: 1 as StepIndex, label: 'Base', hint: 'Dati essenziali e acquisto' },
  { index: 2 as StepIndex, label: 'Stile', hint: 'Colori, materiali e tags' },
  { index: 3 as StepIndex, label: 'Contesto', hint: 'Stagioni e usi' },
  { index: 4 as StepIndex, label: 'Cura', hint: 'Lavaggio, asciugatura e stiratura' },
  { index: 5 as StepIndex, label: 'Foto', hint: 'Upload e foto' },
];

const washTypeOptions: SelectDropdownOption[] = [
  { id: 'do_not_wash', label: 'Non lavare' },
  { id: 'hand_wash_only', label: 'Solo a mano' },
  { id: 'washer_ok', label: 'Lavatrice ok' },
];

const bleachTypeOptions: SelectDropdownOption[] = [
  { id: 'no_bleach', label: 'Nessuna' },
  { id: 'non_chlorine_bleach', label: 'Senza cloro' },
  { id: 'any_bleach', label: 'Qualsiasi' },
];

const dryingTemperatureOptions: SelectDropdownOption[] = [
  { id: '', label: 'Nessuna' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

function isDefaultAttachmentName(value: string) {
  return /^(?:photo|image|img|immagine|screenshot|pasted[ _-]?image|clipboard)(?:[ _-]*\d+)?(?:\.[a-z0-9]+)?$/i.test(value);
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const ironingTypeOptions: SelectDropdownOption[] = [
  { id: 'yes', label: 'Sì' },
  { id: 'without_steam', label: 'Senza vapore' },
  { id: 'no', label: 'No' },
];

const ironingTemperatureOptions: SelectDropdownOption[] = [
  { id: '1', label: '● (1 - Bassa, max 110°C)' },
  { id: '2', label: '● ● (2 - Media, max 150°C)' },
  { id: '3', label: '● ● ● (3 - Alta, max 200°C)' },
];

const statusOptions: SelectDropdownOption[] = [
  { id: 'in_wardrobe', label: "Nell'armadio", emoji: '🚪' },
  { id: 'in_storage', label: 'In deposito', emoji: '📦' },
  { id: 'dismissed', label: 'Dismesso', emoji: '🏷️' },
];

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormField,
    SelectDropdownComponent,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    ButtonComponent,
    WashingIconComponent,
    DryingIconComponent,
    IroningIconComponent,
    ContextSelectorComponent,
    WindowFrameComponent,
  ],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
})
export class WardrobeWizardPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(ApiService);
  private readonly storage = inject(OfflineStorageService, { optional: true });
  private readonly syncService = inject(SyncService, { optional: true });
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly titleService = inject(Title);
  readonly referenceStore = inject(ReferenceStoreService);

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  readonly steps = steps;
  readonly currentStep = signal<StepIndex>(1);
  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly loadedCloth = signal<ClothesItem | null>(null);

  readonly allPhotos = signal<WizardPhotoItem[]>([]);
  readonly attachmentsToDelete = signal<string[]>([]);
  readonly uploadProgress = signal<{
    total: number;
    current: number;
    percent: number;
    currentFileName: string;
  } | null>(null);

  readonly quickBrandBusy = signal(false);
  readonly quickColorBusy = signal(false);
  readonly quickMaterialBusy = signal(false);
  readonly quickSeasonBusy = signal(false);
  readonly quickTemperatureBusy = signal(false);
  readonly quickUseCaseBusy = signal(false);
  readonly quickTagBusy = signal(false);
  readonly submitAttempted = signal(false);
  readonly blockedStep = signal<StepIndex | null>(null);
  readonly codeStatus = signal<'available' | 'taken' | 'invalid'>('available');
  private latestCodeCheckValue = '';

  readonly wizardModel = signal<WizardFormModel>(createInitialWizardModel());
  readonly wizardForm = form(this.wizardModel, (schema) => {
    pattern(schema.base.code, /^[A-Z0-9]{3}$/i, { message: 'Il codice etichetta deve essere di 3 caratteri alfanumerici' });
    min(schema.base.quantity, 1, { message: 'La quantità deve essere almeno 1' });
    minLength(schema.style.color_ids, 1, { message: 'Seleziona almeno un colore' });

    minLength(schema.context.season_ids, 1, { message: 'Seleziona almeno una stagione' });
    minLength(schema.context.temperature_ids, 1, { message: 'Seleziona almeno una temperatura' });

    min(schema.care.washing.washing_temperature, 0, { message: 'Temperatura minima 0' });
    max(schema.care.washing.washing_temperature, 95, { message: 'Temperatura massima 95' });
    min(schema.care.washing.color_loss_test_temperature, 0, { message: 'Temperatura minima 0' });
    max(schema.care.washing.color_loss_test_temperature, 95, { message: 'Temperatura massima 95' });

    min(schema.care.ironing.ironing_temperature, 1, { message: 'Seleziona la temperatura di stiraggio' });
    max(schema.care.ironing.ironing_temperature, 3, { message: 'Seleziona la temperatura di stiraggio' });

    pattern(schema.buy.detail.shop_url, /^$|^https?:\/\/.+/, {
      message: 'Inserisci un URL valido (http:// o https://)',
    });
  });

  readonly isEditMode = computed(() => Boolean(this.editingId()));
  readonly title = computed(() => (this.isEditMode() ? 'Modifica capo' : 'Nuovo capo'));
  readonly currentClothTitle = computed(() => {
    const customName = this.wizardForm.base.name().value()?.trim();
    if (customName) {
      return customName;
    }
    const loaded = this.loadedCloth();
    if (loaded?.name?.trim()) {
      return loaded.name.trim();
    }
    if (loaded?.fullTitle?.trim()) {
      return loaded.fullTitle.trim();
    }
    const typeId = this.wizardForm.base.type_id().value();
    const brandId = this.wizardForm.base.brand_id().value();
    const colorIds = this.wizardForm.style.color_ids().value();

    const typeName = this.referenceStore.types().find((t) => t.id === typeId)?.name?.trim();
    const brandName = this.referenceStore.brands().find((b) => b.id === brandId)?.name?.trim() || loaded?.brand?.name?.trim();
    const colorName = this.referenceStore.colors().find((c) => colorIds.includes(c.id))?.name?.trim();

    const parts = [typeName, brandName, colorName].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }

    return null;
  });
  readonly saveLabel = computed(() => (this.isEditMode() ? 'Aggiorna' : 'Crea'));
  readonly photoCount = computed(() => this.allPhotos().length);
  readonly failedPhotos = computed(() => this.allPhotos().filter((p) => p.uploadFailed));
  readonly fitDropdownOptions = computed<SelectDropdownOption[]>(() => [
    { id: '', label: 'Nessun fit' },
    ...this.referenceStore.fits().map((fit) => ({ id: fit.id, label: fit.name })),
  ]);
  readonly brandDropdownOptions = computed<SelectDropdownOption[]>(() => [
    { id: '', label: 'Nessun brand' },
    ...this.referenceStore.brands().map((brand) => ({ id: brand.id, label: brand.name })),
  ]);
  readonly typeDropdownOptions = computed<SelectDropdownOption[]>(() =>
    [{ id: '', label: 'Nessun tipo' }, ...this.referenceStore.types().map((type) => ({ id: type.id, label: type.name }))],
  );
  readonly statusOptions = statusOptions;
  readonly locationDropdownOptions = computed<SelectDropdownOption[]>(() => {
    const sorted = this.referenceStore.locationsSortedByRoomAndName();
    const roomsMap = new Map(this.referenceStore.rooms().map((r) => [r.id, r.name]));
    return [
      { id: '', label: 'Nessuna posizione' },
      ...sorted.map((loc) => {
        const roomName = loc.roomId ? roomsMap.get(loc.roomId) : null;
        const label = roomName ? `${roomName} › ${loc.name}` : loc.name;
        return {
          id: loc.id,
          label,
          emoji: '📍',
        };
      }),
    ];
  });
  readonly washTypeOptions = washTypeOptions;
  readonly bleachTypeOptions = bleachTypeOptions;
  readonly dryingTemperatureOptions = dryingTemperatureOptions;
  readonly ironingTypeOptions = ironingTypeOptions;
  readonly ironingTemperatureOptions = ironingTemperatureOptions;

  readonly washingProgramDropdownOptions = computed<SelectDropdownOption[]>(() => [
    { id: '', label: 'Nessun programma' },
    ...this.referenceStore.washingPrograms().map((p) => {
      const specs: string[] = [];
      if (p.temperature) specs.push(`${p.temperature}°`);
      if (p.spinSpeed != null) specs.push(`${p.spinSpeed} giri`);
      const suffix = specs.length ? ` (${specs.join(', ')})` : '';
      return { id: p.id, label: `${p.name}${suffix}` };
    }),
  ]);

  readonly detergentDropdownOptions = computed<SelectDropdownOption[]>(() => [
    { id: '', label: 'Nessun detersivo' },
    ...this.referenceStore.detergents().map((d) => ({
      id: d.id,
      label: d.description ? `${d.name} (${d.description})` : d.name,
    })),
  ]);

  readonly isWashingDetailsEnabled = computed(
    () => this.wizardForm.care.washingEnabled().value() && this.wizardForm.care.washing.wash_type().value() !== 'do_not_wash',
  );
  readonly isWashingTemperatureRequired = computed(
    () =>
      this.wizardForm.care.washingEnabled().value() &&
      this.wizardForm.care.washing.wash_type().value() === 'washer_ok' &&
      !this.wizardForm.care.washing.washing_program_id().value(),
  );
  readonly isDryingTemperatureEnabled = computed(
    () => this.wizardForm.care.dryingEnabled().value() && this.wizardForm.care.drying.tumble_dry().value(),
  );
  readonly isIroningDetailsEnabled = computed(
    () => this.wizardForm.care.ironingEnabled().value() && this.wizardForm.care.ironing.iron_type().value() !== 'no',
  );

  readonly canProceed = computed(() => {
    return this.isStepValid(this.currentStep());
  });

  private readonly initialSnapshot = signal<string>('');
  private skipUnsavedGuard = false;

  takeSnapshot(): string {
    return JSON.stringify({
      model: this.wizardModel(),
      photos: this.allPhotos().map((p) => ({ id: p.id, source: p.source, name: p.name })),
      deleted: this.attachmentsToDelete(),
    });
  }

  hasUnsavedChanges(): boolean {
    if (this.saving() || this.loading()) {
      return false;
    }
    const initial = this.initialSnapshot();
    if (!initial) {
      return false;
    }
    return this.takeSnapshot() !== initial;
  }

  async confirmDiscardChanges(): Promise<boolean> {
    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Modifiche non salvate',
        message: 'Ci sono modifiche non salvate nel wizard. Sei sicuro di voler uscire e annullare le modifiche?',
        confirmLabel: 'Esci',
        cancelLabel: 'Annulla',
        confirmVariant: 'danger',
      },
    });
    const confirmed = await firstValueFrom(dialogRef.closed);
    return Boolean(confirmed);
  }

  async canDeactivate(): Promise<boolean> {
    if (this.skipUnsavedGuard || !this.hasUnsavedChanges()) {
      return true;
    }
    return this.confirmDiscardChanges();
  }

  constructor() {
    this.initialSnapshot.set(this.takeSnapshot());
    effect(() => {
      void this.referenceStore.loadAll();
    });
    effect(() => {
      if (this.isEditMode()) {
        const clothName = this.currentClothTitle();
        if (clothName) {
          this.titleService.setTitle(`Modifica ${clothName} - Dressly`);
        } else {
          this.titleService.setTitle('Modifica capo - Dressly');
        }
      } else {
        this.titleService.setTitle('Nuovo capo - Dressly');
      }
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editingId.set(id);
      void this.loadClothes(id);
    } else {
      void this.checkCodeAvailability(this.wizardModel().base.code, null);
    }

    const stepParam = this.route.snapshot.queryParamMap.get('step');
    if (stepParam) {
      const stepNum = Number(stepParam);
      if (stepNum >= 1 && stepNum <= 5) {
        this.currentStep.set(stepNum as StepIndex);
      }
    }
  }

  ngOnDestroy() {
    for (const photo of this.allPhotos()) {
      if (photo.source === 'pending') {
        URL.revokeObjectURL(photo.previewUrl);
      }
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  handlePaste(event: ClipboardEvent) {
    if (this.currentStep() !== 5) {
      return;
    }

    const files: File[] = [];
    for (const item of Array.from(event.clipboardData?.items ?? [])) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      this.addPendingFiles(files, 'paste');
    }
  }

  selectStep(step: StepIndex) {
    if (step === this.currentStep()) {
      return;
    }

    this.blockedStep.set(null);
    this.currentStep.set(step);
  }

  previousStep() {
    const target = Math.max(1, this.currentStep() - 1) as StepIndex;
    this.blockedStep.set(null);
    this.currentStep.set(target);
  }

  nextStep() {
    const target = Math.min(5, this.currentStep() + 1) as StepIndex;
    this.blockedStep.set(null);
    this.currentStep.set(target);
  }

  async save() {
    this.submitAttempted.set(true);
    const invalidStep = this.getFirstInvalidStep();
    if (invalidStep) {
      this.currentStep.set(invalidStep);
      this.blockedStep.set(invalidStep);
      this.toast.info('Completa i campi richiesti prima di salvare');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.allPhotos.update((photos) =>
      photos.map((p) => (p.uploadFailed || p.errorMessage ? { ...p, uploadFailed: false, errorMessage: undefined } : p)),
    );

    try {
      const payload = this.buildPayload();
      const isEdit = Boolean(this.editingId());
      const isOnline = this.syncService ? !this.syncService.checkIsOffline() : (typeof navigator !== 'undefined' && navigator.onLine);

      let clothesId: string;

      if (isOnline) {
        // When online, persist immediately on server so the record exists before uploading attachments
        if (isEdit) {
          clothesId = this.editingId()!;
          await firstValueFrom(this.api.updateClothes(clothesId, payload));
        } else {
          const saved = await firstValueFrom(this.api.createClothes(payload));
          if (!saved?.id) {
            throw new Error("Impossibile recuperare l'id del capo salvato");
          }
          clothesId = saved.id;
        }

        // 1. Delete removed existing attachments
        for (const attachmentId of this.attachmentsToDelete()) {
          try {
            await firstValueFrom(this.api.deleteAttachment(clothesId, attachmentId));
          } catch {
            // ignore
          }
        }

        // 2. Upload pending attachments with progress
        const pendingPhotos = this.allPhotos().filter((photo) => photo.source === 'pending' && photo.file);
        const uploadedMap = new Map<string, string>();
        const failedPhotosList: Array<{ name: string; reason: string }> = [];

        if (pendingPhotos.length > 0) {
          this.uploadProgress.set({
            total: pendingPhotos.length,
            current: 0,
            percent: 0,
            currentFileName: '',
          });

          for (let i = 0; i < pendingPhotos.length; i++) {
            const photo = pendingPhotos[i];
            this.uploadProgress.set({
              total: pendingPhotos.length,
              current: i + 1,
              percent: 0,
              currentFileName: photo.name,
            });

            const result = await this.uploadSinglePhoto(clothesId, photo);
            if (result.success) {
              uploadedMap.set(photo.id, result.id);
            } else {
              failedPhotosList.push({ name: photo.name, reason: result.error });
              this.allPhotos.update((photos) =>
                photos.map((p) => (p.id === photo.id ? { ...p, uploadFailed: true, errorMessage: result.error } : p)),
              );
            }
          }
        }

        // 3. Reorder attachments according to current allPhotos() order
        const finalOrderedIds: string[] = [];
        for (const photo of this.allPhotos()) {
          if (photo.source === 'existing') {
            finalOrderedIds.push(photo.id);
          } else if (uploadedMap.has(photo.id)) {
            finalOrderedIds.push(uploadedMap.get(photo.id)!);
          }
        }

        if (finalOrderedIds.length > 0) {
          try {
            await firstValueFrom(this.api.reorderAttachments(clothesId, finalOrderedIds));
          } catch {
            // ignore
          }
        }

        // 4. Update allPhotos with successfully uploaded items transformed to existing
        this.allPhotos.update((photos) =>
          photos.map((p) => {
            const uploadedId = uploadedMap.get(p.id);
            if (uploadedId) {
              if (p.source === 'pending' && p.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(p.previewUrl);
              }
              return {
                id: uploadedId,
                source: 'existing' as const,
                previewUrl: this.getExistingAttachmentUrl(uploadedId),
                name: p.name,
              };
            }
            return p;
          }),
        );
        this.attachmentsToDelete.set([]);

        // 5. Update local storage with complete fresh item from API (including attachments)
        if (this.storage) {
          try {
            const fresh = await firstValueFrom(this.api.getClothes(clothesId));
            if (fresh) {
              await this.storage.saveClothes([fresh]);
            }
          } catch {
            // graceful fallback
          }
        }

        if (this.syncService) {
          this.syncService.notifyDataChanged();
        }

        // If one or more photos failed to upload, switch/remain in edit mode and allow retry
        if (failedPhotosList.length > 0) {
          this.editingId.set(clothesId);
          this.currentStep.set(5);
          this.uploadProgress.set(null);
          this.saving.set(false);

          const tree = this.router.createUrlTree(['/wardrobe', clothesId, 'edit'], {
            queryParamsHandling: 'preserve',
          });
          this.location.replaceState(tree.toString());

          void this.checkCodeAvailability(this.wizardModel().base.code, clothesId);

          this.initialSnapshot.set(
            JSON.stringify({
              model: this.wizardModel(),
              photos: this.allPhotos()
                .filter((p) => p.source === 'existing')
                .map((p) => ({ id: p.id, source: p.source, name: p.name })),
              deleted: [],
            }),
          );

          const reasonsText = failedPhotosList
            .map((f) => `"${f.name}": ${f.reason}`)
            .join('; ');

          const errorSummary = isEdit
            ? `Il capo è stato aggiornato, ma il caricamento di ${failedPhotosList.length === 1 ? 'una foto' : `${failedPhotosList.length} foto`} è fallito (${reasonsText}). Puoi correggere o ritentare l'upload premendo 'Aggiorna'.`
            : `Il capo è stato creato con successo, ma il caricamento di ${failedPhotosList.length === 1 ? 'una foto' : `${failedPhotosList.length} foto`} è fallito (${reasonsText}). L'editor è ora in modalità modifica: puoi ritentare l'upload premendo 'Aggiorna'.`;

          this.error.set(errorSummary);
          return;
        }
      } else {
        // Offline: save to local IndexedDB and queue sync mutation
        clothesId = this.editingId() || generateUuid();

        if (this.storage) {
          const existing = isEdit ? await this.storage.getClothes(clothesId) : null;
          const localItem: ClothesItem = {
            ...(existing ?? ({} as ClothesItem)),
            id: clothesId,
            name: (payload['name'] as string) ?? null,
            code: (payload['code'] as string) ?? null,
            size: (payload['size'] as string) ?? null,
            status: (payload['status'] as ClothesStatus) ?? 'in_wardrobe',
            locationId: (payload['location_id'] as string) ?? null,
            notes: (payload['notes'] as string) ?? null,
            updatedAt: new Date().toISOString(),
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            userId: existing?.userId ?? '',
          };
          await this.storage.saveClothes([localItem]);
        }

        if (this.syncService) {
          await this.syncService.queueClothesChange(clothesId, isEdit ? 'update' : 'create', payload);
        }
      }

      this.uploadProgress.set(null);
      this.skipUnsavedGuard = true;
      this.saving.set(false);
      this.toast.success(isEdit ? 'Capo aggiornato!' : 'Capo salvato!');

      const callbackUrl = this.route.snapshot.queryParamMap.get('callbackUrl');
      if (callbackUrl) {
        void this.router.navigateByUrl(callbackUrl);
      } else {
        void this.router.navigate(['/wardrobe', clothesId]);
      }
    } catch (error) {
      const errorMsg = extractApiErrorMessage(error);
      this.error.set(errorMsg);
      this.toast.error(errorMsg);
    } finally {
      this.saving.set(false);
      this.uploadProgress.set(null);
    }
  }

  private uploadSinglePhoto(
    clothesId: string,
    photo: WizardPhotoItem,
  ): Promise<{ success: true; id: string } | { success: false; error: string }> {
    return new Promise((resolve) => {
      if (!photo.file) {
        resolve({ success: false, error: 'File non disponibile' });
        return;
      }

      this.api.uploadAttachmentWithProgress(clothesId, photo.file, 'photo', photo.name).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const filePercent = Math.round((event.loaded / event.total) * 100);
            const current = this.uploadProgress();
            if (current) {
              this.uploadProgress.set({
                ...current,
                percent: filePercent,
              });
            }
          } else if (event.type === HttpEventType.Response) {
            const body = event.body;
            if (body?.id) {
              resolve({ success: true, id: body.id });
            } else {
              resolve({ success: false, error: 'Risposta server priva di identificativo allegato' });
            }
          }
        },
        error: (err: unknown) => {
          const reason = extractUploadErrorMessage(err, photo.file);
          this.toast.error(`Upload fallito per ${photo.name}: ${reason}`);
          resolve({ success: false, error: reason });
        },
      });
    });
  }

  async cancelOrClose() {
    if (this.hasUnsavedChanges()) {
      const confirmed = await this.confirmDiscardChanges();
      if (!confirmed) {
        return;
      }
      this.skipUnsavedGuard = true;
    }

    const callbackUrl = this.route.snapshot.queryParamMap.get('callbackUrl');
    if (callbackUrl) {
      void this.router.navigateByUrl(callbackUrl);
    } else {
      void this.router.navigate(['..'], { relativeTo: this.route });
    }
  }

  openFilePicker(input?: HTMLInputElement) {
    if (input) {
      input.click();
    } else {
      this.fileInput?.nativeElement.click();
    }
  }

  onFilesSelected(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    this.addPendingFiles(files, 'picker');
    (event.target as HTMLInputElement).value = '';
  }

  onDragOverDropzone(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDropDropzone(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      this.addPendingFiles(files, 'picker');
    }
  }

  removePhoto(id: string) {
    const photo = this.allPhotos().find((p) => p.id === id);
    if (!photo) return;

    if (photo.source === 'pending') {
      URL.revokeObjectURL(photo.previewUrl);
    } else {
      this.attachmentsToDelete.update((ids) => [...ids, id]);
    }

    this.allPhotos.set(this.allPhotos().filter((p) => p.id !== id));
  }

  movePhoto(id: string, direction: -1 | 1) {
    const photos = this.allPhotos();
    const index = photos.findIndex((p) => p.id === id);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= photos.length) return;

    const next = [...photos];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    this.allPhotos.set(next);
  }

  onDropPhoto(event: CdkDragDrop<WizardPhotoItem[]>) {
    const photos = [...this.allPhotos()];
    moveItemInArray(photos, event.previousIndex, event.currentIndex);
    this.allPhotos.set(photos);
  }

  isImageAttachment(mimeType: string | null | undefined) {
    return mimeType?.startsWith('image/') ?? false;
  }

  getExistingAttachmentUrl(attachmentId: string) {
    const clothesId = this.editingId();
    if (!clothesId) {
      return '';
    }

    return `/api/clothes/${clothesId}/attachments/${attachmentId}/file`;
  }

  async openCreateBrandModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      panelClass: 'brand-create-dialog-panel',
      data: {
        title: 'Nuovo brand',
        description: 'Inserisci il nome del brand da creare.',
        label: 'Nome brand',
        placeholder: 'Es. Uniqlo',
        requiredMessage: 'Inserisci il nome del brand',
        confirmLabel: 'Crea',
      },
    });
    const name = await firstValueFrom(dialogRef.closed);
    if (!name?.trim()) {
      return;
    }

    this.quickBrandBusy.set(true);
    try {
      const created = await this.referenceStore.create('brands', {
        name: name.trim(),
      });

      if (created?.id) {
        this.wizardForm.base.brand_id().value.set(created.id);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile creare il brand');
    } finally {
      this.quickBrandBusy.set(false);
    }
  }

  async openCreateTagModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Nuovo tag',
        description: 'Inserisci il nome del tag da creare.',
        label: 'Nome tag',
        placeholder: 'Es. ufficio',
        requiredMessage: 'Inserisci il nome del tag',
        confirmLabel: 'Crea',
      },
    });
    const name = await firstValueFrom(dialogRef.closed);
    if (!name?.trim()) {
      return;
    }

    this.quickTagBusy.set(true);
    try {
      const created = await this.referenceStore.create('tags', {
        name: name.trim(),
      });

      if (created?.id) {
        const current = this.wizardForm.style.tag_ids().value();
        if (!current.includes(created.id)) {
          this.wizardForm.style.tag_ids().value.set([...current, created.id]);
        }
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile creare il tag');
    } finally {
      this.quickTagBusy.set(false);
    }
  }

  async openCreateColorModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Nuovo colore',
        description: 'Inserisci il nome del colore da creare.',
        label: 'Nome colore',
        placeholder: 'Es. Blu navy',
        requiredMessage: 'Inserisci il nome del colore',
        confirmLabel: 'Crea',
      },
    });
    const name = await firstValueFrom(dialogRef.closed);
    if (!name?.trim()) {
      return;
    }

    this.quickColorBusy.set(true);
    try {
      const created = await this.referenceStore.create('colors', {
        name: name.trim(),
      });

      if (created?.id) {
        const current = this.wizardForm.style.color_ids().value();
        if (!current.includes(created.id)) {
          this.wizardForm.style.color_ids().value.set([...current, created.id]);
        }
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile creare il colore');
    } finally {
      this.quickColorBusy.set(false);
    }
  }

  async openCreateMaterialModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Nuovo materiale',
        description: 'Inserisci il nome del materiale da creare.',
        label: 'Nome materiale',
        placeholder: 'Es. Lino',
        requiredMessage: 'Inserisci il nome del materiale',
        confirmLabel: 'Crea',
      },
    });
    const name = await firstValueFrom(dialogRef.closed);
    if (!name?.trim()) {
      return;
    }

    this.quickMaterialBusy.set(true);
    try {
      const created = await this.referenceStore.create('materials', {
        name: name.trim(),
      });

      if (created?.id) {
        const current = this.wizardForm.style.material_ids().value();
        if (!current.includes(created.id)) {
          this.wizardForm.style.material_ids().value.set([...current, created.id]);
        }
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile creare il materiale');
    } finally {
      this.quickMaterialBusy.set(false);
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
    if (!name?.trim()) {
      return;
    }

    this.quickSeasonBusy.set(true);
    try {
      const created = await this.referenceStore.create('seasons', {
        name: name.trim(),
      });

      if (created?.id) {
        const current = this.wizardForm.context.season_ids().value();
        if (!current.includes(created.id)) {
          this.wizardForm.context.season_ids().value.set([...current, created.id]);
        }
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile creare la stagione');
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
    if (!name?.trim()) {
      return;
    }

    this.quickTemperatureBusy.set(true);
    try {
      const created = await this.referenceStore.create('temperatures', {
        name: name.trim(),
      });

      if (created?.id) {
        const current = this.wizardForm.context.temperature_ids().value();
        if (!current.includes(created.id)) {
          this.wizardForm.context.temperature_ids().value.set([...current, created.id]);
        }
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile creare la temperatura');
    } finally {
      this.quickTemperatureBusy.set(false);
    }
  }

  async openCreateUseCaseModal() {
    const dialogRef = this.dialog.open<string | null>(CreateNameModalComponent, {
      data: {
        title: 'Nuova occasione',
        description: 'Inserisci il nome dell occasione da creare.',
        label: 'Nome occasione',
        placeholder: 'Es. Cerimonia',
        requiredMessage: 'Inserisci il nome dell occasione',
        confirmLabel: 'Crea',
      },
    });
    const name = await firstValueFrom(dialogRef.closed);
    if (!name?.trim()) {
      return;
    }

    this.quickUseCaseBusy.set(true);
    try {
      const created = await this.referenceStore.create('use-cases', {
        name: name.trim(),
      });

      if (created?.id) {
        const current = this.wizardForm.context.use_case_ids().value();
        if (!current.includes(created.id)) {
          this.wizardForm.context.use_case_ids().value.set([...current, created.id]);
        }
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Impossibile creare l occasione');
    } finally {
      this.quickUseCaseBusy.set(false);
    }
  }

  setSelectValue(field: any, id: string) {
    field().value.set(id);
  }

  toggleWashingEnabled() {
    this.onWashingEnabledChange(!this.wizardForm.care.washingEnabled().value());
  }

  toggleDryingEnabled() {
    this.onDryingEnabledChange(!this.wizardForm.care.dryingEnabled().value());
  }

  toggleTumbleDry() {
    this.onTumbleDryChange(!this.wizardForm.care.drying.tumble_dry().value());
  }

  toggleIroningEnabled() {
    this.onIroningEnabledChange(!this.wizardForm.care.ironingEnabled().value());
  }

  toggleIronInsideOut() {
    this.wizardForm.care.ironing.inside_out().value.set(!this.wizardForm.care.ironing.inside_out().value());
  }

  onWashingProgramChange(id: string) {
    const value = id ? id.trim() : null;
    this.wizardForm.care.washing.washing_program_id().value.set(value);
    if (value) {
      this.wizardForm.care.washing.washing_temperature().value.set(null);
    }
  }

  onDetergentChange(id: string) {
    const value = id ? id.trim() : null;
    this.wizardForm.care.washing.detergent_id().value.set(value);
  }

  cycleColorLoss() {
    const current = this.wizardForm.care.washing.color_loss().value();
    let next: number | null;
    if (current === null) {
      next = 0;
    } else if (current === 0) {
      next = 1;
    } else {
      next = null;
    }
    this.wizardForm.care.washing.color_loss().value.set(next);
  }

  setWashType(id: string) {
    this.wizardForm.care.washing.wash_type().value.set(id as WizardWashingForm['wash_type']);
    if (id === 'do_not_wash') {
      this.wizardForm.care.washing.washing_program_id().value.set(null);
      this.wizardForm.care.washing.washing_temperature().value.set(null);
      this.wizardForm.care.washing.detergent_id().value.set(null);
      this.wizardForm.care.washing.color_loss_test_temperature().value.set(null);
      this.wizardForm.care.washing.stretch().value.set(false);
      this.wizardForm.care.washing.reverse_washing().value.set(false);
      this.wizardForm.care.washing.closed_zips().value.set(false);
      this.wizardForm.care.washing.similar_colors().value.set(false);
      this.wizardForm.care.washing.wash_separately().value.set(false);
      this.wizardForm.care.washing.use_color_catcher().value.set(false);
      this.wizardForm.care.washing.color_loss().value.set(null);
      this.wizardForm.care.washing.notes().value.set('');
    }

    if (id === 'hand_wash_only') {
      this.wizardForm.care.washing.washing_program_id().value.set(null);
      this.wizardForm.care.washing.washing_temperature().value.set(null);
    }
  }

  onWashingEnabledChange(enabled: boolean) {
    this.wizardForm.care.washingEnabled().value.set(enabled);
    if (!enabled) {
      this.wizardForm.care.washing.washing_program_id().value.set(null);
      this.wizardForm.care.washing.washing_temperature().value.set(null);
      this.wizardForm.care.washing.detergent_id().value.set(null);
      this.wizardForm.care.washing.color_loss_test_temperature().value.set(null);
      this.wizardForm.care.washing.wash_type().value.set('washer_ok');
      this.wizardForm.care.washing.stretch().value.set(false);
      this.wizardForm.care.washing.reverse_washing().value.set(false);
      this.wizardForm.care.washing.closed_zips().value.set(false);
      this.wizardForm.care.washing.similar_colors().value.set(false);
      this.wizardForm.care.washing.wash_separately().value.set(false);
      this.wizardForm.care.washing.use_color_catcher().value.set(false);
      this.wizardForm.care.washing.color_loss().value.set(null);
      this.wizardForm.care.washing.notes().value.set('');
    }
  }

  onDryingEnabledChange(enabled: boolean) {
    this.wizardForm.care.dryingEnabled().value.set(enabled);
    if (!enabled) {
      this.wizardForm.care.drying.tumble_dry().value.set(false);
      this.wizardForm.care.drying.tumble_dry_temperature().value.set('');
    }
  }

  onTumbleDryChange(enabled: boolean) {
    this.wizardForm.care.drying.tumble_dry().value.set(enabled);
    if (!enabled) {
      this.wizardForm.care.drying.tumble_dry_temperature().value.set('');
    }
  }

  onIroningEnabledChange(enabled: boolean) {
    this.wizardForm.care.ironingEnabled().value.set(enabled);
    if (!enabled) {
      this.wizardForm.care.ironing.iron_type().value.set('yes');
      this.wizardForm.care.ironing.ironing_temperature().value.set(null);
      this.wizardForm.care.ironing.inside_out().value.set(false);
    }
  }

  onIronTypeChange(id: string) {
    this.wizardForm.care.ironing.iron_type().value.set(id as WizardIroningForm['iron_type']);
    if (id === 'no') {
      this.wizardForm.care.ironing.ironing_temperature().value.set(null);
      this.wizardForm.care.ironing.inside_out().value.set(false);
    }
  }

  getIroningTemperatureId(): string {
    const val = this.wizardForm.care.ironing.ironing_temperature().value();
    if (val === null || val === undefined) {
      return '';
    }
    return String(this.mapExistingIroningTemperature(val) ?? '');
  }

  onIroningTemperatureChange(id: string) {
    const num = id ? Number(id) : null;
    this.wizardForm.care.ironing.ironing_temperature().value.set(num);
  }

  private mapExistingIroningTemperature(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    const num = Number(value);
    if (Number.isNaN(num) || num <= 0) {
      return null;
    }
    if (num <= 1) return 1;
    if (num === 2) return 2;
    if (num === 3) return 3;
    if (num <= 110) return 1;
    if (num <= 150) return 2;
    return 3;
  }

  onSizeInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const uppercaseValue = input.value.toUpperCase();
    if (input.value !== uppercaseValue) {
      input.value = uppercaseValue;
    }
    this.wizardForm.base.size().value.set(uppercaseValue);
  }

  async checkCodeAvailability(code: string, excludeId?: string | null): Promise<void> {
    const clean = code?.trim().toUpperCase() ?? '';
    this.latestCodeCheckValue = clean;

    if (clean.length !== 3 || !/^[A-Z0-9]{3}$/i.test(clean)) {
      this.codeStatus.set('invalid');
      return;
    }

    if (this.storage) {
      const isAvailable = await this.storage.isTagCodeAvailable(clean, excludeId);
      if (this.latestCodeCheckValue === clean) {
        this.codeStatus.set(isAvailable ? 'available' : 'taken');
      }
    } else {
      this.codeStatus.set('available');
    }
  }

  onCodeInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    if (input.value !== clean) {
      input.value = clean;
    }
    this.wizardForm.base.code().value.set(clean);
    void this.checkCodeAvailability(clean, this.editingId());
  }

  onCumulativeChange(event: Event | boolean) {
    const isChecked = typeof event === 'boolean' ? event : (event.target as HTMLInputElement).checked;
    this.wizardModel.update((prev) => {
      const currentQty = prev.base.quantity;
      const nextQty = isChecked ? (currentQty && currentQty > 1 ? currentQty : 2) : 1;
      return {
        ...prev,
        base: {
          ...prev.base,
          is_cumulative: isChecked,
          quantity: nextQty,
        },
      };
    });
  }

  onQuantityInput(event: Event | number) {
    const val = typeof event === 'number' ? event : parseInt((event.target as HTMLInputElement).value, 10);
    const validQty = Number.isFinite(val) && val >= 1 ? val : 1;
    this.wizardForm.base.quantity().value.set(validQty);
  }

  toggleArray(field: any, id: string) {
    const current = field().value() as string[];
    const next = current.includes(id) ? current.filter((value: string) => value !== id) : [...current, id];
    field().value.set(next);
  }

  toggleBoolean(field: any) {
    field().value.set(!field().value());
  }

  resolveColorHex(hexCode: string | null) {
    return normalizeHexColor(hexCode);
  }

  showFieldError(
    field: { invalid: () => boolean; touched: () => boolean; dirty: () => boolean },
    step: StepIndex,
  ) {
    return field.invalid() && (field.touched() || field.dirty() || this.submitAttempted() || this.blockedStep() === step);
  }

  fieldError(field: { errors: () => Array<{ message?: string }> }, fallback: string) {
    return field.errors()[0]?.message ?? fallback;
  }

  hasStepError(step: StepIndex) {
    if (step === 5) {
      return false;
    }

    const shouldShow = this.submitAttempted() || step <= this.currentStep();
    return shouldShow && !this.isStepValid(step);
  }

  private isStepValid(step: StepIndex) {
    switch (step) {
      case 1:
        return (
          !this.wizardForm.base.size().invalid() &&
          !this.wizardForm.base.code().invalid() &&
          this.codeStatus() === 'available' &&
          !this.wizardForm.buy.detail.shop_url().invalid()
        );
      case 2:
        return !this.wizardForm.style.color_ids().invalid();
      case 3:
        return !this.wizardForm.context.season_ids().invalid() && !this.wizardForm.context.temperature_ids().invalid();
      case 4:
        return this.isCareStepValid();
      case 5:
        return true;
      default:
        return true;
    }
  }

  private getFirstInvalidStep(): StepIndex | null {
    const validationOrder: StepIndex[] = [1, 2, 3, 4];
    for (const step of validationOrder) {
      if (!this.isStepValid(step)) {
        return step;
      }
    }

    return null;
  }

  private isCareStepValid() {
    if (this.isWashingTemperatureRequired()) {
      const washingTemperature = this.wizardForm.care.washing.washing_temperature().value();
      if (washingTemperature === null || this.wizardForm.care.washing.washing_temperature().invalid()) {
        return false;
      }
    }

    if (this.isWashingDetailsEnabled()) {
      if (this.wizardForm.care.washing.color_loss_test_temperature().invalid()) {
        return false;
      }
    }

    if (this.isDryingTemperatureEnabled()) {
      const dryingTemperature = this.wizardForm.care.drying.tumble_dry_temperature().value();
      if (!dryingTemperature) {
        return false;
      }
    }

    if (this.isIroningDetailsEnabled()) {
      const ironingTemperature = this.wizardForm.care.ironing.ironing_temperature().value();
      if (ironingTemperature === null || this.wizardForm.care.ironing.ironing_temperature().invalid()) {
        return false;
      }
    }

    return true;
  }

  async loadClothes(id: string) {
    this.loading.set(true);
    try {
      if (this.storage) {
        const cached = await this.storage.getClothes(id);
        if (cached) {
          this.loadedCloth.set(cached);
          this.patchForms(cached);
          this.initialSnapshot.set(this.takeSnapshot());
          this.loading.set(false);
          if (this.syncService && !this.syncService.checkIsOffline()) {
            void this.refreshClothesFromServer(id);
          }
          return;
        }
      }

      const clothes = await firstValueFrom(this.api.getClothes(id));
      if (clothes) {
        this.loadedCloth.set(clothes);
        this.patchForms(clothes);
        this.initialSnapshot.set(this.takeSnapshot());
        if (this.storage) {
          await this.storage.saveClothes([clothes]);
        }
      }
    } catch {
      // graceful fallback
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshClothesFromServer(id: string) {
    try {
      const clothes = await firstValueFrom(this.api.getClothes(id));
      if (clothes && this.editingId() === id) {
        this.loadedCloth.set(clothes);
        this.patchForms(clothes);
        this.initialSnapshot.set(this.takeSnapshot());
        if (this.storage) {
          await this.storage.saveClothes([clothes]);
        }
      }
    } catch {
      // background refresh fallback
    }
  }

  private patchForms(item: ClothesItem) {
    const rawWashTemp = item.washingInstruction?.temperature ?? item.washingInstruction?.washing_temperature;
    const washingTemperature =
      rawWashTemp !== null && rawWashTemp !== undefined && rawWashTemp !== ''
        ? Number(rawWashTemp)
        : null;
    const rawColorLoss = item.washingInstruction?.colorLossRisk;
    let colorLossVal: number | null = null;
    if (rawColorLoss !== null && rawColorLoss !== undefined) {
      colorLossVal = Number(rawColorLoss) === 1 || (rawColorLoss as unknown) === true ? 1 : 0;
    }
    const dryingMethod = item.dryingInstruction?.method?.trim() ?? '';
    const fallbackTumbleDry = dryingMethod.startsWith('tumble_dry:');
    const fallbackTumbleDryLevel = fallbackTumbleDry ? dryingMethod.slice('tumble_dry:'.length).trim() : '';

    this.wizardModel.set({
      base: {
        name: item.name ?? '',
        code: item.code ?? generateRandomTagCode(),
        status: item.status ?? 'in_wardrobe',
        location_id: item.locationId ?? item.location?.id ?? '',
        size: item.size ?? '',
        fit_id: item.fit?.id ?? '',
        brand_id: item.brand?.id ?? '',
        type_id: item.type?.id ?? '',
        notes: item.notes ?? '',
        is_cumulative: Boolean(item.isCumulative),
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
      },
      style: {
        color_ids: item.colors?.map((color) => color.id) ?? [],
        material_ids: item.materials?.map((material) => material.id) ?? [],
        tag_ids: item.tags?.map((tag) => tag.id) ?? [],
      },
      context: {
        season_ids: item.seasons?.map((season) => season.id) ?? [],
        temperature_ids: item.temperatures?.map((temperature) => temperature.id) ?? [],
        use_case_ids: item.useCases?.map((useCase) => useCase.id) ?? [],
      },
      care: {
        washingEnabled: Boolean(item.washingInstruction),
        washing: {
          wash_type:
            item.washingInstruction?.washType ??
            (washingTemperature === null && !item.washingInstruction?.washingProgramId && !item.washingInstruction?.washingProgram ? 'do_not_wash' : 'washer_ok'),
          bleach_type: item.washingInstruction?.bleachType ?? 'no_bleach',
          stretch: Boolean(item.washingInstruction?.stretch),
          washing_program_id:
            item.washingInstruction?.washingProgramId ?? item.washingInstruction?.washingProgram?.id ?? null,
          washing_temperature: washingTemperature,
          detergent_id: item.washingInstruction?.detergentId ?? item.washingInstruction?.detergent?.id ?? null,
          reverse_washing: Boolean(item.washingInstruction?.reverseWashing),
          closed_zips: Boolean(item.washingInstruction?.closedZips),
          similar_colors: Boolean(item.washingInstruction?.similarColors),
          wash_separately: Boolean(item.washingInstruction?.washSeparately),
          use_color_catcher: Boolean(item.washingInstruction?.useColorCatcher),
          color_loss: colorLossVal,
          color_loss_test_temperature: item.washingInstruction?.colorLossTestTemperature ?? null,
          notes: item.washingInstruction?.notes ?? '',
        },
        dryingEnabled: Boolean(item.dryingInstruction),
        drying: {
          tumble_dry: item.dryingInstruction?.tumbleDry ?? fallbackTumbleDry,
          tumble_dry_temperature:
            item.dryingInstruction?.tumbleDryTemperature === 'low' ||
            item.dryingInstruction?.tumbleDryTemperature === 'medium' ||
            item.dryingInstruction?.tumbleDryTemperature === 'high'
              ? item.dryingInstruction.tumbleDryTemperature
              : fallbackTumbleDryLevel === 'low' || fallbackTumbleDryLevel === 'medium' || fallbackTumbleDryLevel === 'high'
                ? fallbackTumbleDryLevel
              : '',
        },
        ironingEnabled: Boolean(item.ironingInstruction),
        ironing: {
          iron_type: item.ironingInstruction?.ironType ?? 'without_steam',
          ironing_temperature: this.mapExistingIroningTemperature(
            item.ironingInstruction?.temperature ?? item.ironingInstruction?.ironing_temperature,
          ),
          inside_out: Boolean(item.ironingInstruction?.ironInsideOut),
        },
      },
      buy: {
        buyEnabled: Boolean(item.buyDetail),
        detail: {
          shop_name: item.buyDetail?.store ?? item.buyDetail?.shop_name ?? '',
          shop_url: item.buyDetail?.shopUrl ?? item.buyDetail?.shop_url ?? '',
          purchase_date: item.buyDetail?.purchaseDate ?? item.buyDetail?.purchase_date ?? '',
        },
      },
    });

    const initialPhotos: WizardPhotoItem[] = (item.attachments ?? [])
      .filter((attachment) => this.isImageAttachment(attachment.mimeType))
      .map((attachment) => ({
        id: attachment.id,
        source: 'existing' as const,
        previewUrl: this.getExistingAttachmentUrl(attachment.id),
        name: attachment.originalName || 'Foto allegata',
      }));

    this.allPhotos.set(initialPhotos);
    this.attachmentsToDelete.set([]);
    void this.checkCodeAvailability(this.wizardModel().base.code, item.id);
  }

  private buildPayload() {
    const value = this.wizardModel();
    const base = value.base;
    const style = value.style;
    const context = value.context;
    const washing = value.care.washing;
    const drying = value.care.drying;
    const ironing = value.care.ironing;
    const buy = value.buy.detail;
    const size = (base.size ?? '').trim();
    const shopName = buy.shop_name.trim();
    const shopUrl = buy.shop_url.trim();
    const purchaseDate = buy.purchase_date.trim();
    const hasBuyDetail = Boolean(shopName || shopUrl || purchaseDate);

    return {
      name: base.name.trim() || null,
      code: base.code ? base.code.trim().toUpperCase() : null,
      status: base.status || 'in_wardrobe',
      location_id: base.location_id || null,
      size: size || null,
      fit_id: base.fit_id || null,
      brand_id: base.brand_id || null,
      type_id: base.type_id || null,
      notes: base.notes.trim() || null,
      is_cumulative: base.is_cumulative,
      quantity: base.is_cumulative ? (base.quantity && base.quantity > 0 ? base.quantity : 1) : 1,
      color_ids: style.color_ids,
      material_ids: style.material_ids,
      tag_ids: style.tag_ids,
      season_ids: context.season_ids,
      temperature_ids: context.temperature_ids,
      use_case_ids: context.use_case_ids,
      washingInstruction: value.care.washingEnabled
        ? {
            washType: washing.wash_type,
            bleachType: washing.bleach_type,
            stretch: washing.stretch,
            reverseWashing: washing.reverse_washing,
            closedZips: washing.closed_zips,
            similarColors: washing.similar_colors,
            washSeparately: washing.wash_separately,
            washingProgramId: washing.washing_program_id || null,
            temperature: washing.washing_program_id
              ? null
              : washing.washing_temperature !== null
                ? String(washing.washing_temperature)
                : null,
            detergentId: washing.detergent_id || null,
            useColorCatcher: washing.use_color_catcher,
            colorLossRisk: washing.color_loss,
            colorLossTestTemperature: washing.color_loss_test_temperature,
            notes: washing.notes?.trim() || null,
          }
        : null,
      dryingInstruction: value.care.dryingEnabled
        ? {
            tumbleDry: drying.tumble_dry,
            tumbleDryTemperature: drying.tumble_dry_temperature || null,
            method: drying.tumble_dry ? `tumble_dry:${drying.tumble_dry_temperature || 'medium'}` : 'air_dry',
          }
        : null,
      ironingInstruction: value.care.ironingEnabled
        ? {
            ironType: ironing.iron_type,
            ironInsideOut: ironing.inside_out,
            temperature: ironing.ironing_temperature !== null ? String(ironing.ironing_temperature) : null,
          }
        : null,
      buyDetail: hasBuyDetail
        ? {
            store: shopName || null,
            purchaseDate: purchaseDate || null,
            shopUrl: shopUrl || null,
          }
        : null,
    };
  }

  private isImageFile(file: File): boolean {
    if (file.type && file.type.startsWith('image/')) {
      return true;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    return Boolean(ext && ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'bmp', 'heic', 'heif'].includes(ext));
  }

  private addPendingFiles(files: File[], source: 'picker' | 'paste') {
    const nextPhotos = [...this.allPhotos()];
    let skippedCount = 0;

    for (const file of files) {
      if (!this.isImageFile(file)) {
        skippedCount++;
        continue;
      }

      const isFromPaste = source === 'paste';
      const normalizedName = this.normalizeAttachmentName(file.name);
      const displayName = isFromPaste || !normalizedName ? 'Nuova foto' : normalizedName;

      nextPhotos.push({
        id: generateUuid(),
        source: 'pending',
        file,
        previewUrl: URL.createObjectURL(file),
        name: displayName,
      });
    }

    if (skippedCount > 0) {
      this.toast.error('I file non supportati sono stati ignorati. Seleziona immagini valide.');
    }

    this.allPhotos.set(nextPhotos);
  }

  private normalizeAttachmentName(name: string | null | undefined) {
    const normalized = name?.trim();
    if (!normalized) {
      return null;
    }

    return isDefaultAttachmentName(normalized) ? null : normalized;
  }
}

export const canDeactivateWardrobeWizard: CanDeactivateFn<WardrobeWizardPageComponent> = (component) => {
  return component.canDeactivate();
};
