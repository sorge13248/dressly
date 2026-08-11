import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { WardrobePageComponent } from './main.component';

describe('WardrobePageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WardrobePageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});