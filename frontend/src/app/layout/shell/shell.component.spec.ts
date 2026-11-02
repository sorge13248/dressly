import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppShellComponent } from './shell.component';
import { LaundryService } from '../../core/laundry.service';
import { PwaUpdateService } from '../../core/pwa-update.service';
import { ReferenceStoreService } from '../../core/reference-store.service';
import { SyncService } from '../../core/sync.service';
import { signal } from '@angular/core';

describe('AppShellComponent', () => {
  const updateAvailableSignal = signal(false);
  const promptUpdateSpy = vi.fn();

  beforeEach(async () => {
    updateAvailableSignal.set(false);
    promptUpdateSpy.mockClear();

    await TestBed.configureTestingModule({
      imports: [AppShellComponent, RouterTestingModule],
      providers: [
        {
          provide: PwaUpdateService,
          useValue: {
            updateAvailable: updateAvailableSignal,
            promptUpdate: promptUpdateSpy,
          },
        },
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

  it('should render mobile menu toggle icon button and toggle menu on click', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();

    const toggleBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector('.nav-toggle');
    expect(toggleBtn).toBeTruthy();

    const svgIcon = toggleBtn?.querySelector('svg.nav-toggle-icon');
    expect(svgIcon).toBeTruthy();
    expect(toggleBtn?.getAttribute('aria-label')).toBe('Apri menu');

    toggleBtn?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.mobileNavOpen()).toBe(true);
    expect(toggleBtn?.getAttribute('aria-label')).toBe('Chiudi menu');
  });

  it('should render update pill when update is available and call promptUpdate on click', () => {
    updateAvailableSignal.set(true);
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();

    const updateBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector('.update-pill-btn');
    expect(updateBtn).toBeTruthy();
    expect(updateBtn?.textContent).toContain('Nuova versione');

    updateBtn?.click();
    expect(promptUpdateSpy).toHaveBeenCalled();
  });
});