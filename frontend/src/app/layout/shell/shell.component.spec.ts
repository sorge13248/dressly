import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppShellComponent } from './shell.component';
import { LaundryService } from '../../core/laundry.service';
import { ReferenceStoreService } from '../../core/reference-store.service';
import { SyncService } from '../../core/sync.service';
import { signal } from '@angular/core';

describe('AppShellComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent, RouterTestingModule],
      providers: [
        {
          provide: SyncService,
          useValue: {
            status: signal('online-ok'),
            pendingCount: signal(0),
            conflicts: signal([]),
            sync: () => Promise.resolve(null),
          },
        },
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

  it('should render nav-pill with items containing nav-item-icon and nav-pill-label', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    const navPillItems = fixture.nativeElement.querySelectorAll('.main-nav.nav-pill .nav-pill-item');
    expect(navPillItems.length).toBe(5);

    const labels = Array.from(fixture.nativeElement.querySelectorAll('.main-nav.nav-pill .nav-pill-label')).map(
      (el: any) => el.textContent.trim(),
    );
    expect(labels.length).toBe(5);
    expect(labels).toEqual(['Guardaroba', 'Abbinamenti', 'Lavatrice', 'Stiratura', 'Domini']);
  });

  it('should toggle menu-open class on main-topbar when mobile menu is toggled', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();

    const topbar: HTMLElement = fixture.nativeElement.querySelector('.main-topbar');
    expect(topbar.classList.contains('menu-open')).toBe(false);

    fixture.componentInstance.toggleNavMenu();
    fixture.detectChanges();
    expect(topbar.classList.contains('menu-open')).toBe(true);

    fixture.componentInstance.closeNavMenu();
    fixture.detectChanges();
    expect(topbar.classList.contains('menu-open')).toBe(false);
  });
});