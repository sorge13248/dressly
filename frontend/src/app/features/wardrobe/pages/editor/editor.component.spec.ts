import { TestBed } from '@angular/core/testing';
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
});