import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
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
});
