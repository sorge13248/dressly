import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { SyncService } from '../../../../core/sync.service';
import { WardrobePageComponent } from './main.component';
import { ClothesItem } from '../../../../core/models';

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

  it('should default per_page to 50', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    expect(component.filters().per_page).toBe(50);
  });

  it('should update per_page and reset page to 1 when setPerPage is called', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    component.setPage(3);
    expect(component.filters().page).toBe(3);

    component.setPerPage(25);
    expect(component.filters().per_page).toBe(25);
    expect(component.filters().page).toBe(1);
  });

  it('should handle onPerPageChange event', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    const select = document.createElement('select');
    const option = document.createElement('option');
    option.value = '100';
    select.appendChild(option);
    select.value = '100';

    const event = { target: select } as unknown as Event;
    component.onPerPageChange(event);

    expect(component.filters().per_page).toBe(100);
  });

  it('should include custom per_page in pageSizeOptions if set to non-default', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    expect(component.pageSizeOptions()).toEqual([12, 25, 50, 100]);

    component.setPerPage(30);
    expect(component.pageSizeOptions()).toEqual([12, 25, 30, 50, 100]);
  });

  it('should render page size select in footer when items exist', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    const fakeItem = {
      id: 'item-1',
      name: 'Maglietta',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('.pager-size-select') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select?.value).toBe('50');

    const options = fixture.nativeElement.querySelectorAll('.pager-size-select option');
    expect(options.length).toBe(4);
  });

  it('should update per_page when user selects a different option from the dropdown', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    const fakeItem = {
      id: 'item-1',
      name: 'Maglietta',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('.pager-size-select') as HTMLSelectElement;
    select.value = '25';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.filters().per_page).toBe(25);
    expect(component.filters().page).toBe(1);
  });

  it('should render a vertical separator in search-banner next to "Nuovo vestito"', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    fixture.detectChanges();

    const separator = fixture.nativeElement.querySelector('.search-banner .banner-separator');
    expect(separator).not.toBeNull();

    const newDressBtn = fixture.nativeElement.querySelector('.search-banner a.primary');
    expect(newDressBtn).not.toBeNull();
    expect(newDressBtn?.textContent).toContain('Nuovo vestito');
  });

  it('should render filters sidebar with filters-sidebar class inside layout-grid', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    fixture.detectChanges();

    const layoutGrid = fixture.nativeElement.querySelector('.layout-grid');
    expect(layoutGrid).not.toBeNull();

    const sidebar = layoutGrid?.querySelector('.filters-sidebar');
    expect(sidebar).not.toBeNull();
    expect(sidebar?.tagName.toLowerCase()).toBe('aside');
  });

  it('should render aero checkbox on each item card and toggle selection', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    vi.spyOn(component, 'load').mockImplementation(async () => {});
    component.selectionService.clear();

    const fakeItem = {
      id: 'item-10',
      name: 'Pantaloni',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    component.loading.set(false);
    component.error.set(null);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.item-card');
    expect(card).not.toBeNull();
    expect(card.classList.contains('selected')).toBe(false);

    const checkbox = fixture.nativeElement.querySelector('.aero-checkbox-input') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);

    // Toggle selection
    component.toggleSelection('item-10');
    fixture.detectChanges();

    expect(component.selectionService.isSelected('item-10')).toBe(true);
    expect(card.classList.contains('selected')).toBe(true);
    expect(checkbox.checked).toBe(true);
  });

  it('should show selection toolbar with "Stira" button only when items are selected', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    component.selectionService.clear();
    fixture.detectChanges();

    let toolbar = fixture.nativeElement.querySelector('.selection-toolbar');
    expect(toolbar).toBeNull();

    component.selectionService.select('item-10');
    fixture.detectChanges();

    toolbar = fixture.nativeElement.querySelector('.selection-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar.textContent).toContain('1 vestito selezionato');

    const buttons = toolbar.querySelectorAll('.toolbar-action-btn');
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toContain('Abbina...');
    expect(buttons[1].textContent).toContain('Metti a lavare');
    expect(buttons[2].textContent).toContain('Stira');

    // Clicking deseleziona clears selection and hides toolbar
    const deselectBtn = toolbar.querySelector('.toolbar-btn') as HTMLButtonElement;
    deselectBtn.click();
    fixture.detectChanges();

    expect(component.selectionService.hasSelection()).toBe(false);
    toolbar = fixture.nativeElement.querySelector('.selection-toolbar');
    expect(toolbar).toBeNull();
  });

  it('should maintain selected item IDs across page changes', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    component.selectionService.clear();

    component.selectionService.select('item-page-1');
    expect(component.selectionService.isSelected('item-page-1')).toBe(true);

    // Change page
    component.setPage(2);
    expect(component.filters().page).toBe(2);
    expect(component.selectionService.isSelected('item-page-1')).toBe(true);

    component.setPage(3);
    expect(component.filters().page).toBe(3);
    expect(component.selectionService.isSelected('item-page-1')).toBe(true);
  });

  it('should navigate to /wardrobe/ironing when "Stira" button is clicked', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const api = TestBed.inject(ApiService);
    vi.spyOn(api, 'addToIroning').mockReturnValue(of({ added: 2, existing: 0, total: 2 }));
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    component.selectionService.clear();
    component.selectionService.selectMany(['item-1', 'item-2']);
    fixture.detectChanges();

    await component.onIron();

    expect(navigateSpy).toHaveBeenCalledWith(['/wardrobe/ironing']);
  });

  it('should call queueLaundryChange when "Metti a lavare" button is clicked', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const syncService = TestBed.inject(SyncService);
    const queueSpy = vi.spyOn(syncService, 'queueLaundryChange');

    component.selectionService.clear();
    component.selectionService.selectMany(['item-1', 'item-2']);
    fixture.detectChanges();

    await component.onAddToWashing();

    expect(queueSpy).toHaveBeenCalledWith('washing', 'item-1', 'create');
    expect(queueSpy).toHaveBeenCalledWith('washing', 'item-2', 'create');
  });

  it('should render quick action buttons on card and toggle washing when clicked', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const syncService = TestBed.inject(SyncService);
    const queueSpy = vi.spyOn(syncService, 'queueLaundryChange');
    vi.spyOn(component, 'load').mockImplementation(async () => {});

    const fakeItem = {
      id: 'item-wash-1',
      name: 'Camicia Bianca',
      userId: 'user-1',
      size: null,
      notes: null,
      isInWashing: false,
      isInIroning: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    component.loading.set(false);
    fixture.detectChanges();

    const quickActionBtns = fixture.nativeElement.querySelectorAll('.item-card .quick-action-btn');
    expect(quickActionBtns.length).toBe(2);

    const washBtn = quickActionBtns[0] as HTMLButtonElement;
    expect(washBtn.getAttribute('title')).toBe('Metti a lavare');

    const clickEvent = new MouseEvent('click');
    const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');

    await component.toggleWashing(fakeItem, clickEvent);
    fixture.detectChanges();

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(queueSpy).toHaveBeenCalledWith('washing', 'item-wash-1', 'create');
    expect(component.items()[0].isInWashing).toBe(true);
  });

  it('should call queueLaundryChange when clicking washing button on an item in washing', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const syncService = TestBed.inject(SyncService);
    const queueSpy = vi.spyOn(syncService, 'queueLaundryChange');
    vi.spyOn(component, 'load').mockImplementation(async () => {});

    const fakeItem = {
      id: 'item-wash-2',
      name: 'Felpa Blu',
      userId: 'user-1',
      size: null,
      notes: null,
      isInWashing: true,
      isInIroning: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    component.loading.set(false);
    fixture.detectChanges();

    const quickActionBtns = fixture.nativeElement.querySelectorAll('.item-card .quick-action-btn');
    const washBtn = quickActionBtns[0] as HTMLButtonElement;
    expect(washBtn.getAttribute('title')).toBe('Togli dalla lavatrice');
    expect(washBtn.classList.contains('active-washing')).toBe(true);

    const clickEvent = new MouseEvent('click');
    await component.toggleWashing(fakeItem, clickEvent);
    fixture.detectChanges();

    expect(queueSpy).toHaveBeenCalledWith('washing', 'item-wash-2', 'delete');
    expect(component.items()[0].isInWashing).toBe(false);
  });

  it('should toggle ironing when clicking ironing quick action button', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const syncService = TestBed.inject(SyncService);
    const queueSpy = vi.spyOn(syncService, 'queueLaundryChange');
    vi.spyOn(component, 'load').mockImplementation(async () => {});

    const fakeItem = {
      id: 'item-iron-1',
      name: 'Pantaloni Eleganti',
      userId: 'user-1',
      size: null,
      notes: null,
      isInWashing: false,
      isInIroning: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    component.loading.set(false);
    fixture.detectChanges();

    const quickActionBtns = fixture.nativeElement.querySelectorAll('.item-card .quick-action-btn');
    const ironBtn = quickActionBtns[1] as HTMLButtonElement;
    expect(ironBtn.getAttribute('title')).toBe('Metti a stirare');

    const clickEvent = new MouseEvent('click');
    await component.toggleIroning(fakeItem, clickEvent);
    fixture.detectChanges();

    expect(queueSpy).toHaveBeenCalledWith('ironing', 'item-iron-1', 'create');
    expect(component.items()[0].isInIroning).toBe(true);

    // Now remove
    const updatedItem = component.items()[0];
    await component.toggleIroning(updatedItem, clickEvent);
    fixture.detectChanges();

    expect(queueSpy).toHaveBeenCalledWith('ironing', 'item-iron-1', 'delete');
    expect(component.items()[0].isInIroning).toBe(false);
  });

  describe('touch-only mobile/tablet filter sidebar drag', () => {
    function createTouchEvent(type: string, touches: Array<{ clientX: number; clientY: number; target?: EventTarget }>) {
      const touchList = touches.map((t, idx) => ({
        identifier: idx,
        target: t.target ?? document.body,
        clientX: t.clientX,
        clientY: t.clientY,
        pageX: t.clientX,
        pageY: t.clientY,
        screenX: t.clientX,
        screenY: t.clientY,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1,
      }));

      const event = new Event(type, { bubbles: true, cancelable: true }) as any;
      event.touches = touchList;
      event.targetTouches = touchList;
      event.changedTouches = touchList;
      return event as TouchEvent;
    }

    beforeEach(() => {
      Object.defineProperty(window, 'ontouchstart', { value: {}, writable: true, configurable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, writable: true, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: 400, writable: true, configurable: true });
    });

    it('should not trigger touch dragging on desktop (width > 900px)', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.filtersOpen()).toBe(false);

      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 380, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 200, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 200, clientY: 200 }]));

      expect(component.filtersOpen()).toBe(false);
    });

    it('should track sidebar under the finger during touch dragging on mobile/tablet', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      fixture.detectChanges();

      const sidebar = fixture.nativeElement.querySelector('.filters-sidebar') as HTMLElement;
      expect(sidebar).not.toBeNull();

      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 380, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 280, clientY: 200 }]));

      expect(sidebar.style.transform).toContain('translateX');
      expect(sidebar.style.transition).toBe('none');
    });

    it('should open filters when dragging from right to left past threshold on mobile/tablet', async () => {
      vi.useFakeTimers();
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.filtersOpen()).toBe(false);

      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 380, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 200, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 200, clientY: 200 }]));

      vi.advanceTimersByTime(300);
      expect(component.filtersOpen()).toBe(true);

      vi.useRealTimers();
    });

    it('should snap closed if dragged less than threshold on mobile/tablet', async () => {
      vi.useFakeTimers();
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.filtersOpen()).toBe(false);

      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 380, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 360, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 360, clientY: 200 }]));

      vi.advanceTimersByTime(300);
      expect(component.filtersOpen()).toBe(false);

      vi.useRealTimers();
    });

    it('should close filters when dragging from left to right while open on mobile/tablet', async () => {
      vi.useFakeTimers();
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.filtersOpen.set(true);
      fixture.detectChanges();
      expect(component.filtersOpen()).toBe(true);

      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 280, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 280, clientY: 200 }]));

      vi.advanceTimersByTime(300);
      expect(component.filtersOpen()).toBe(false);

      vi.useRealTimers();
    });

    it('should not trigger drag for vertical scrolling gestures', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      const sidebar = fixture.nativeElement.querySelector('.filters-sidebar') as HTMLElement;

      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 380, clientY: 200 }]));
      // Vertical movement greater than horizontal
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 375, clientY: 300 }]));

      expect(sidebar.style.transform).toBe('');
      expect(component.filtersOpen()).toBe(false);
    });

    it('should ignore drag-to-open if touch starts outside the right 1/3 of the screen', async () => {
      vi.useFakeTimers();
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      const sidebar = fixture.nativeElement.querySelector('.filters-sidebar') as HTMLElement;
      expect(component.filtersOpen()).toBe(false);

      // Window width is 400px. Right 1/3 starts at 266.67px.
      // Touch starts at 200px (outside the right 1/3)
      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 50, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 50, clientY: 200 }]));

      vi.advanceTimersByTime(300);
      expect(sidebar.style.transform).toBe('');
      expect(component.filtersOpen()).toBe(false);

      vi.useRealTimers();
    });

    it('should allow drag-to-open if touch starts inside the right 1/3 of the screen', async () => {
      vi.useFakeTimers();
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.filtersOpen()).toBe(false);

      // Window width is 400px. Right 1/3 starts at 266.67px.
      // Touch starts at 300px (inside the right 1/3)
      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 300, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 100, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 100, clientY: 200 }]));

      vi.advanceTimersByTime(300);
      expect(component.filtersOpen()).toBe(true);

      vi.useRealTimers();
    });

    it('should strictly require right 1/3 even after sidebar has been opened and closed', async () => {
      vi.useFakeTimers();
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const fixture = TestBed.createComponent(WardrobePageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // 1. Open sidebar by dragging from right 1/3
      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 350, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 100, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 100, clientY: 200 }]));
      vi.advanceTimersByTime(300);
      expect(component.filtersOpen()).toBe(true);

      // 2. Close sidebar by dragging left to right
      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 350, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 350, clientY: 200 }]));
      vi.advanceTimersByTime(300);
      expect(component.filtersOpen()).toBe(false);

      // 3. Now touch in the left 2/3 (e.g. clientX = 150) and drag left
      const sidebar = fixture.nativeElement.querySelector('.filters-sidebar') as HTMLElement;
      window.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 150, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 50, clientY: 200 }]));
      window.dispatchEvent(createTouchEvent('touchend', [{ clientX: 50, clientY: 200 }]));
      vi.advanceTimersByTime(300);

      // Must remain closed and no transform applied!
      expect(sidebar.style.transform).toBe('');
      expect(component.filtersOpen()).toBe(false);

      vi.useRealTimers();
    });
  });
});