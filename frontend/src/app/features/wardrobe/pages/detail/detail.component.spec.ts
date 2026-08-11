import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { WardrobeDetailPageComponent } from './detail.component';

describe('WardrobeDetailPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WardrobeDetailPageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});