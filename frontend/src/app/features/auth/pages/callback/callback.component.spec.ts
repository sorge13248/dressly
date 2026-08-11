import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { CallbackPageComponent } from './callback.component';

describe('CallbackPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallbackPageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(CallbackPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});