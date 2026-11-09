import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { WardrobeWizardPageComponent, extractUploadErrorMessage } from './editor.component';

describe('WardrobeWizardPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WardrobeWizardPageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should have 5 steps with Foto as step 5', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;

    expect(comp.steps.length).toBe(5);
    expect(comp.steps[0].label).toBe('Base');
    expect(comp.steps[1].label).toBe('Stile');
    expect(comp.steps[2].label).toBe('Contesto');
    expect(comp.steps[3].label).toBe('Cura');
    expect(comp.steps[4].label).toBe('Foto');
  });

  it('should navigate through steps bounded between 1 and 5', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;

    expect(comp.currentStep()).toBe(1);
    comp.previousStep();
    expect(comp.currentStep()).toBe(1);

    comp.nextStep();
    expect(comp.currentStep()).toBe(2);

    comp.selectStep(5);
    expect(comp.currentStep()).toBe(5);
    comp.nextStep();
    expect(comp.currentStep()).toBe(5);
  });

  it('should resolve fileInput in step 5', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    comp.selectStep(5);
    fixture.detectChanges();
    expect(comp.fileInput).toBeDefined();
    expect(comp.fileInput?.nativeElement).toBeDefined();
  });

  it('should support adding, reordering and removing photos in the unified photo gallery', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;

    comp.allPhotos.set([
      { id: 'photo-1', source: 'existing', name: 'Foto 1', previewUrl: 'url-1' },
      { id: 'photo-2', source: 'existing', name: 'Foto 2', previewUrl: 'url-2' },
      { id: 'photo-3', source: 'pending', name: 'Foto 3', previewUrl: 'url-3' },
    ]);

    expect(comp.photoCount()).toBe(3);

    // Move photo-2 backward (to index 0)
    comp.movePhoto('photo-2', -1);
    expect(comp.allPhotos()[0].id).toBe('photo-2');
    expect(comp.allPhotos()[1].id).toBe('photo-1');

    // Remove photo-1 (existing) -> marks for delete
    comp.removePhoto('photo-1');
    expect(comp.allPhotos().map((p) => p.id)).toEqual(['photo-2', 'photo-3']);
    expect(comp.attachmentsToDelete()).toContain('photo-1');
  });

  it('should have ironing temperature options with dot indicators', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;

    expect(comp.ironingTemperatureOptions.length).toBe(3);
    expect(comp.ironingTemperatureOptions[0].label).toContain('●');
    expect(comp.ironingTemperatureOptions[1].label).toContain('● ●');
    expect(comp.ironingTemperatureOptions[2].label).toContain('● ● ●');

    comp.onIroningTemperatureChange('2');
    expect(comp.wizardForm.care.ironing.ironing_temperature().value()).toBe(2);
    expect(comp.getIroningTemperatureId()).toBe('2');

    comp.onIroningTemperatureChange('');
    expect(comp.wizardForm.care.ironing.ironing_temperature().value()).toBeNull();
    expect(comp.getIroningTemperatureId()).toBe('');
  });

  it('should initialize step from query param if provided', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const route = TestBed.inject(ActivatedRoute);

    vi.spyOn(route.snapshot.queryParamMap, 'get').mockImplementation((key: string) => {
      if (key === 'step') return '4';
      return null;
    });

    comp.ngOnInit();
    expect(comp.currentStep()).toBe(4);
  });

  it('should navigate to callbackUrl when cancelOrClose is called and callbackUrl exists', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const route = TestBed.inject(ActivatedRoute);
    const router = TestBed.inject(Router);
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockImplementation(() => Promise.resolve(true));

    vi.spyOn(route.snapshot.queryParamMap, 'get').mockImplementation((key: string) => {
      if (key === 'callbackUrl') return '/wardrobe/ironing?ids=1,2';
      return null;
    });

    comp.cancelOrClose();
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/wardrobe/ironing?ids=1,2');
  });

  it('should show confirmation dialog when cancelOrClose is called with unsaved changes and abort if rejected', async () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const dialog = TestBed.inject(Dialog);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    const dialogOpenSpy = vi.spyOn(dialog, 'open').mockReturnValue({
      closed: of(false),
    } as any);

    // Modify a field to create unsaved changes
    comp.wizardForm.base.name().value.set('Nuovo capo di prova');
    expect(comp.hasUnsavedChanges()).toBe(true);

    await comp.cancelOrClose();

    expect(dialogOpenSpy).toHaveBeenCalledWith(ConfirmModalComponent, expect.objectContaining({
      data: expect.objectContaining({
        title: 'Modifiche non salvate',
        confirmLabel: 'Esci',
      }),
    }));
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('should proceed with cancelOrClose when confirmation dialog is accepted', async () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const dialog = TestBed.inject(Dialog);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    vi.spyOn(dialog, 'open').mockReturnValue({
      closed: of(true),
    } as any);

    comp.wizardForm.base.name().value.set('Camicia modificata');
    expect(comp.hasUnsavedChanges()).toBe(true);

    await comp.cancelOrClose();

    expect(navigateSpy).toHaveBeenCalledWith(['..'], { relativeTo: expect.anything() });
  });

  it('should prompt via canDeactivate when unsaved changes exist', async () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const dialog = TestBed.inject(Dialog);

    // Without changes
    expect(await comp.canDeactivate()).toBe(true);

    // With changes, user cancels
    comp.allPhotos.set([
      { id: 'new-p', source: 'pending', name: 'foto.jpg', previewUrl: 'blob:url' },
    ]);
    expect(comp.hasUnsavedChanges()).toBe(true);

    vi.spyOn(dialog, 'open').mockReturnValue({
      closed: of(false),
    } as any);

    expect(await comp.canDeactivate()).toBe(false);

    // With changes, user confirms
    vi.spyOn(dialog, 'open').mockReturnValue({
      closed: of(true),
    } as any);

    expect(await comp.canDeactivate()).toBe(true);
  });

  it('should accept valid images and ignore unsupported files in addPendingFiles', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;

    const validFile = new File(['content'], 'camicia.jpg', { type: 'image/jpeg' });
    const textFile = new File(['text'], 'notes.txt', { type: 'text/plain' });

    (comp as any).addPendingFiles([validFile, textFile], 'picker');

    expect(comp.allPhotos().length).toBe(1);
    expect(comp.allPhotos()[0].name).toBe('camicia.jpg');
    expect(comp.allPhotos()[0].source).toBe('pending');
  });

  it('should create clothes via api and upload pending photos when online on save', async () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const api = TestBed.inject(ApiService);
    const router = TestBed.inject(Router);

    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
    vi.spyOn(api, 'createClothes').mockReturnValue(of({ id: 'new-clothes-123' } as any));
    vi.spyOn(api, 'getClothes').mockReturnValue(of({
      id: 'new-clothes-123',
      name: 'Polo blu',
      attachments: [{ id: 'att-1', fileName: 'polo.jpg', mimeType: 'image/jpeg' }],
    } as any));
    vi.spyOn(api, 'uploadAttachmentWithProgress').mockReturnValue(of({
      type: 4, // HttpEventType.Response
      body: { id: 'att-1' },
    } as any));
    vi.spyOn(api, 'reorderAttachments').mockReturnValue(of([] as any));

    // Fill minimum required fields
    comp.wizardForm.base.name().value.set('Polo blu');
    comp.wizardForm.base.type_id().value.set('type-1');
    comp.wizardForm.base.brand_id().value.set('brand-1');
    comp.wizardForm.style.color_ids().value.set(['col-1']);
    comp.wizardForm.context.season_ids().value.set(['seas-1']);
    comp.wizardForm.context.temperature_ids().value.set(['temp-1']);

    const photoFile = new File(['photo'], 'polo.jpg', { type: 'image/jpeg' });
    comp.allPhotos.set([
      { id: 'pending-1', source: 'pending', file: photoFile, name: 'polo.jpg', previewUrl: 'blob:url' },
    ]);

    await comp.save();

    expect(api.createClothes).toHaveBeenCalled();
    expect(api.uploadAttachmentWithProgress).toHaveBeenCalledWith('new-clothes-123', photoFile, 'photo', 'polo.jpg');
    expect(api.reorderAttachments).toHaveBeenCalledWith('new-clothes-123', ['att-1']);
    expect(router.navigate).toHaveBeenCalledWith(['/wardrobe', 'new-clothes-123']);
  });

  it('should fetch from server if clothes not found in local storage on loadClothes', async () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const api = TestBed.inject(ApiService);

    vi.spyOn(api, 'getClothes').mockReturnValue(of({
      id: 'c-456',
      name: 'Giacca lino',
      attachments: [{ id: 'att-99', fileName: 'giacca.jpg', originalName: 'Giacca', mimeType: 'image/jpeg' }],
    } as any));

    await comp.loadClothes('c-456');

    expect(api.getClothes).toHaveBeenCalledWith('c-456');
    expect(comp.wizardForm.base.name().value()).toBe('Giacca lino');
    expect(comp.allPhotos().length).toBe(1);
    expect(comp.allPhotos()[0].id).toBe('att-99');
    expect(comp.allPhotos()[0].source).toBe('existing');
  });

  it('should compute saveLabel as Crea in create mode and Aggiorna in edit mode', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;

    expect(comp.isEditMode()).toBe(false);
    expect(comp.saveLabel()).toBe('Crea');

    comp.editingId.set('clothes-123');
    expect(comp.isEditMode()).toBe(true);
    expect(comp.saveLabel()).toBe('Aggiorna');

    fixture.detectChanges();
    const saveBtn = fixture.nativeElement.querySelector('.dock-btn-save');
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.textContent).toContain('Aggiorna');
  });

  it('should render dock navigation buttons with icons and labels', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    const prevBtn = fixture.nativeElement.querySelector('.dock-btn-prev') as HTMLButtonElement;
    const nextBtn = fixture.nativeElement.querySelector('.dock-btn-next') as HTMLButtonElement;

    expect(prevBtn).toBeTruthy();
    expect(prevBtn.getAttribute('aria-label')).toBe('Indietro');
    expect(prevBtn.querySelector('.dock-btn-icon')).toBeTruthy();
    expect(prevBtn.querySelector('.dock-btn-label')?.textContent?.trim()).toBe('Indietro');
    expect(prevBtn.disabled).toBe(true);

    expect(nextBtn).toBeTruthy();
    expect(nextBtn.getAttribute('aria-label')).toBe('Avanti');
    expect(nextBtn.querySelector('.dock-btn-icon')).toBeTruthy();
    expect(nextBtn.querySelector('.dock-btn-label')?.textContent?.trim()).toBe('Avanti');

    // Click next button
    nextBtn.click();
    fixture.detectChanges();
    expect(comp.currentStep()).toBe(2);
    expect(prevBtn.disabled).toBe(false);

    // Go to step 5: next button is disabled
    comp.selectStep(5);
    fixture.detectChanges();
    const nextBtnStep5 = fixture.nativeElement.querySelector('.dock-btn-next') as HTMLButtonElement;
    expect(nextBtnStep5.disabled).toBe(true);
  });

  it('should support cumulative checkbox and quantity input', () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    expect(comp.wizardForm.base.is_cumulative().value()).toBe(false);
    expect(comp.wizardForm.base.quantity().value()).toBe(1);

    // Toggle cumulative ON
    comp.onCumulativeChange(true);
    expect(comp.wizardForm.base.is_cumulative().value()).toBe(true);
    expect(comp.wizardForm.base.quantity().value()).toBe(2);

    // Change quantity input
    comp.onQuantityInput(5);
    expect(comp.wizardForm.base.quantity().value()).toBe(5);

    // Toggle cumulative OFF
    comp.onCumulativeChange(false);
    expect(comp.wizardForm.base.is_cumulative().value()).toBe(false);
    expect(comp.wizardForm.base.quantity().value()).toBe(1);
  });

  it('should include cumulative fields in save payload', async () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const api = TestBed.inject(ApiService);
    const router = TestBed.inject(Router);

    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
    vi.spyOn(api, 'createClothes').mockReturnValue(of({ id: 'new-cumul-123' } as any));
    vi.spyOn(api, 'getClothes').mockReturnValue(of({ id: 'new-cumul-123', name: 'Calzini', attachments: [] } as any));

    comp.wizardForm.base.name().value.set('Calzini neri');
    comp.wizardForm.base.type_id().value.set('type-1');
    comp.wizardForm.base.brand_id().value.set('brand-1');
    comp.wizardForm.style.color_ids().value.set(['col-1']);
    comp.wizardForm.context.season_ids().value.set(['seas-1']);
    comp.wizardForm.context.temperature_ids().value.set(['temp-1']);

    comp.onCumulativeChange(true);
    comp.onQuantityInput(6);

    await comp.save();

    expect(api.createClothes).toHaveBeenCalledWith(
      expect.objectContaining({
        is_cumulative: true,
        quantity: 6,
      }),
    );
  });

  it('should accept cold wash temperature 0 and load it properly', async () => {
    const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
    const comp = fixture.componentInstance;
    const api = TestBed.inject(ApiService);

    vi.spyOn(api, 'getClothes').mockReturnValue(of({
      id: 'c-cold',
      name: 'Vestito seta',
      washingInstruction: {
        washType: 'washer_ok',
        temperature: '0',
      },
      attachments: [],
    } as any));

    await comp.loadClothes('c-cold');

    expect(comp.wizardForm.care.washing.wash_type().value()).toBe('washer_ok');
    expect(comp.wizardForm.care.washing.washing_temperature().value()).toBe(0);
    expect(comp.wizardForm.care.washing.washing_temperature().invalid()).toBe(false);
  });

  describe('Tag code offline availability verification', () => {
    it('should set codeStatus to available for a valid unused code', async () => {
      const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
      const comp = fixture.componentInstance;
      const storage = TestBed.inject(OfflineStorageService);
      vi.spyOn(storage, 'isTagCodeAvailable').mockResolvedValue(true);

      const input = document.createElement('input');
      input.value = '7kx';
      comp.onCodeInput({ target: input } as any);

      expect(input.value).toBe('7KX');
      await fixture.whenStable();
      expect(comp.codeStatus()).toBe('available');
    });

    it('should set codeStatus to taken if code already exists in offline storage', async () => {
      const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
      const comp = fixture.componentInstance;
      const storage = TestBed.inject(OfflineStorageService);
      vi.spyOn(storage, 'isTagCodeAvailable').mockResolvedValue(false);

      const input = document.createElement('input');
      input.value = '9AB';
      comp.onCodeInput({ target: input } as any);

      await fixture.whenStable();
      expect(comp.codeStatus()).toBe('taken');
      expect((comp as any).isStepValid(1)).toBe(false);
    });

    it('should set codeStatus to invalid for incomplete code', async () => {
      const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
      const comp = fixture.componentInstance;

      const input = document.createElement('input');
      input.value = '7K';
      comp.onCodeInput({ target: input } as any);

      expect(comp.codeStatus()).toBe('invalid');
      expect((comp as any).isStepValid(1)).toBe(false);
    });

    it('should pass excludeId when editing an existing cloth', async () => {
      const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
      const comp = fixture.componentInstance;
      const storage = TestBed.inject(OfflineStorageService);
      const spy = vi.spyOn(storage, 'isTagCodeAvailable').mockResolvedValue(true);

      comp.editingId.set('existing-cloth-1');
      const input = document.createElement('input');
      input.value = '8ZZ';
      comp.onCodeInput({ target: input } as any);

      await fixture.whenStable();
      expect(spy).toHaveBeenCalledWith('8ZZ', 'existing-cloth-1');
      expect(comp.codeStatus()).toBe('available');
    });
  });

  describe('extractUploadErrorMessage helper', () => {
    it('should format 413 Payload Too Large with file size if available', () => {
      const file = new File(['a'.repeat(12 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
      const err413 = new HttpErrorResponse({ status: 413, statusText: 'Payload Too Large' });
      const msg = extractUploadErrorMessage(err413, file);
      expect(msg).toContain('File troppo grande');
      expect(msg).toContain('10MB');
    });

    it('should format status 0 as connection error', () => {
      const err0 = new HttpErrorResponse({ status: 0 });
      expect(extractUploadErrorMessage(err0)).toContain('Errore di connessione o rete non disponibile');
    });

    it('should format 401 as session expired', () => {
      const err401 = new HttpErrorResponse({ status: 401 });
      expect(extractUploadErrorMessage(err401)).toContain('Sessione scaduta');
    });

    it('should extract message from backend response when available', () => {
      const err400 = new HttpErrorResponse({
        status: 400,
        error: { message: 'Il file deve essere un formato immagine valido' },
      });
      expect(extractUploadErrorMessage(err400)).toBe('Il file deve essere un formato immagine valido');
    });
  });

  describe('Photo upload failure resilience and retry flow', () => {
    it('should transition editor into edit mode, remain in step 5, update URL and preserve failed photo on upload error', async () => {
      const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
      const comp = fixture.componentInstance;
      const api = TestBed.inject(ApiService);
      const router = TestBed.inject(Router);
      const location = TestBed.inject(Location);

      const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
      const replaceStateSpy = vi.spyOn(location, 'replaceState');
      vi.spyOn(api, 'createClothes').mockReturnValue(of({ id: 'created-cloth-999' } as any));
      vi.spyOn(api, 'getClothes').mockReturnValue(of({ id: 'created-cloth-999', attachments: [] } as any));

      const photoFile = new File(['content'], 'foto_pesante.jpg', { type: 'image/jpeg' });
      const err413 = new HttpErrorResponse({ status: 413, statusText: 'Payload Too Large' });
      vi.spyOn(api, 'uploadAttachmentWithProgress').mockReturnValue(throwError(() => err413));

      // Fill required fields
      comp.wizardForm.base.name().value.set('Maglione lana');
      comp.wizardForm.base.type_id().value.set('type-1');
      comp.wizardForm.base.brand_id().value.set('brand-1');
      comp.wizardForm.style.color_ids().value.set(['col-1']);
      comp.wizardForm.context.season_ids().value.set(['seas-1']);
      comp.wizardForm.context.temperature_ids().value.set(['temp-1']);

      comp.allPhotos.set([
        { id: 'pending-p1', source: 'pending', file: photoFile, name: 'foto_pesante.jpg', previewUrl: 'blob:mock-url' },
      ]);

      await comp.save();

      // Check that clothes was created
      expect(api.createClothes).toHaveBeenCalled();

      // Check that editor did NOT navigate away to detail
      expect(navigateSpy).not.toHaveBeenCalledWith(['/wardrobe', 'created-cloth-999']);

      // Check that editor switched to edit mode
      expect(comp.editingId()).toBe('created-cloth-999');
      expect(comp.isEditMode()).toBe(true);
      expect(comp.saveLabel()).toBe('Aggiorna');

      // Check URL was replaced to edit mode
      expect(replaceStateSpy).toHaveBeenCalledWith('/wardrobe/created-cloth-999/edit');

      // Check wizard is on step 5
      expect(comp.currentStep()).toBe(5);

      // Check photo is marked as failed with exact message
      expect(comp.allPhotos().length).toBe(1);
      const failed = comp.allPhotos()[0];
      expect(failed.source).toBe('pending');
      expect(failed.uploadFailed).toBe(true);
      expect(failed.errorMessage).toContain('File troppo grande');
      expect(failed.errorMessage).toContain('10MB');

      // Check failedPhotos computed signal
      expect(comp.failedPhotos().length).toBe(1);
      expect(comp.failedPhotos()[0].id).toBe('pending-p1');

      // Check error notice summary
      expect(comp.error()).toContain('foto_pesante.jpg');
      expect(comp.error()).toContain('File troppo grande');
      expect(comp.error()).toContain('Aggiorna');
    });

    it('should retry upload on subsequent save (Aggiorna) and proceed to detail on success', async () => {
      const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
      const comp = fixture.componentInstance;
      const api = TestBed.inject(ApiService);
      const router = TestBed.inject(Router);

      const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
      vi.spyOn(api, 'createClothes').mockReturnValue(of({ id: 'created-cloth-999' } as any));
      vi.spyOn(api, 'updateClothes').mockReturnValue(of({ id: 'created-cloth-999' } as any));
      vi.spyOn(api, 'getClothes').mockReturnValue(of({ id: 'created-cloth-999', attachments: [] } as any));
      vi.spyOn(api, 'reorderAttachments').mockReturnValue(of([] as any));

      const photoFile = new File(['content'], 'foto.jpg', { type: 'image/jpeg' });

      // First attempt fails with network error
      const err0 = new HttpErrorResponse({ status: 0 });
      const uploadSpy = vi.spyOn(api, 'uploadAttachmentWithProgress').mockReturnValue(throwError(() => err0));

      comp.wizardForm.base.name().value.set('Giacca');
      comp.wizardForm.base.type_id().value.set('type-1');
      comp.wizardForm.base.brand_id().value.set('brand-1');
      comp.wizardForm.style.color_ids().value.set(['col-1']);
      comp.wizardForm.context.season_ids().value.set(['seas-1']);
      comp.wizardForm.context.temperature_ids().value.set(['temp-1']);

      comp.allPhotos.set([
        { id: 'pending-1', source: 'pending', file: photoFile, name: 'foto.jpg', previewUrl: 'blob:url-1' },
      ]);

      await comp.save();

      expect(comp.isEditMode()).toBe(true);
      expect(comp.allPhotos()[0].uploadFailed).toBe(true);
      expect(navigateSpy).not.toHaveBeenCalled();

      // Now retry with successful upload
      uploadSpy.mockReturnValue(of({
        type: 4, // HttpEventType.Response
        body: { id: 'att-success-1' },
      } as any));

      await comp.save();

      expect(api.updateClothes).toHaveBeenCalledWith('created-cloth-999', expect.anything());
      expect(uploadSpy).toHaveBeenCalledTimes(2);
      expect(comp.allPhotos()[0].source).toBe('existing');
      expect(comp.allPhotos()[0].id).toBe('att-success-1');
      expect(navigateSpy).toHaveBeenCalledWith(['/wardrobe', 'created-cloth-999']);
    });

    it('should separate successful and failed photos when multiple photos are uploaded', async () => {
      const fixture = TestBed.createComponent(WardrobeWizardPageComponent);
      const comp = fixture.componentInstance;
      const api = TestBed.inject(ApiService);

      vi.spyOn(api, 'createClothes').mockReturnValue(of({ id: 'cloth-multi' } as any));
      vi.spyOn(api, 'getClothes').mockReturnValue(of({ id: 'cloth-multi', attachments: [] } as any));
      vi.spyOn(api, 'reorderAttachments').mockReturnValue(of([] as any));

      const file1 = new File(['1'], 'ok.jpg', { type: 'image/jpeg' });
      const file2 = new File(['2'], 'fail.jpg', { type: 'image/jpeg' });

      vi.spyOn(api, 'uploadAttachmentWithProgress').mockImplementation((_id, file) => {
        if (file.name === 'ok.jpg') {
          return of({ type: 4, body: { id: 'att-ok' } } as any);
        }
        return throwError(() => new HttpErrorResponse({ status: 500 }));
      });

      comp.wizardForm.base.name().value.set('Completo');
      comp.wizardForm.base.type_id().value.set('type-1');
      comp.wizardForm.base.brand_id().value.set('brand-1');
      comp.wizardForm.style.color_ids().value.set(['col-1']);
      comp.wizardForm.context.season_ids().value.set(['seas-1']);
      comp.wizardForm.context.temperature_ids().value.set(['temp-1']);

      comp.allPhotos.set([
        { id: 'p-ok', source: 'pending', file: file1, name: 'ok.jpg', previewUrl: 'blob:1' },
        { id: 'p-fail', source: 'pending', file: file2, name: 'fail.jpg', previewUrl: 'blob:2' },
      ]);

      await comp.save();

      expect(comp.editingId()).toBe('cloth-multi');
      expect(comp.allPhotos().length).toBe(2);

      const okPhoto = comp.allPhotos().find((p) => p.name === 'ok.jpg');
      const failPhoto = comp.allPhotos().find((p) => p.name === 'fail.jpg');

      expect(okPhoto?.source).toBe('existing');
      expect(okPhoto?.id).toBe('att-ok');

      expect(failPhoto?.source).toBe('pending');
      expect(failPhoto?.uploadFailed).toBe(true);
      expect(failPhoto?.errorMessage).toContain('Errore interno del server');
    });
  });
});
