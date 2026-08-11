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
});