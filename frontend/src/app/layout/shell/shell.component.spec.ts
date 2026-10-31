import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppShellComponent } from './shell.component';
import { LaundryService } from '../../core/laundry.service';
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
        {
          provide: LaundryService,
          useValue: {
            refreshCounts: () => Promise.resolve(),
            washingCount: () => 0,
            ironingCount: () => 0,
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