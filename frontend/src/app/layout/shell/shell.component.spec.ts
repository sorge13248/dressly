import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppShellComponent } from './shell.component';
import { ReferenceStoreService } from '../../core/reference-store.service';

describe('AppShellComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent, RouterTestingModule],
      providers: [
        {
          provide: ReferenceStoreService,
          useValue: {
            loadAll: () => Promise.resolve(),
            loading: () => false,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should link the brand logo to /wardrobe', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    const brandLink: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a.brand-block');
    expect(brandLink).toBeTruthy();
    expect(brandLink?.getAttribute('href')).toBe('/wardrobe');
  });
});