import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { WardrobeWizardPageComponent } from './editor.component';

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
});
