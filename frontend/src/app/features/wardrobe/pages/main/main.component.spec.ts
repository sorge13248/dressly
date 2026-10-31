import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
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
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('Metti a lavare');
    expect(buttons[1].textContent).toContain('Stira');

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

  it('should call addToWashing when "Metti a lavare" button is clicked', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(ApiService);
    const addSpy = vi.spyOn(api, 'addToWashing').mockReturnValue(of({ added: 2, existing: 0, total: 2 }));

    component.selectionService.clear();
    component.selectionService.selectMany(['item-1', 'item-2']);
    fixture.detectChanges();

    await component.onAddToWashing();

    expect(addSpy).toHaveBeenCalledWith(['item-1', 'item-2']);
  });

  it('should render quick action buttons on card and toggle washing when clicked', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(ApiService);
    vi.spyOn(component, 'load').mockImplementation(async () => {});
    const addWashingSpy = vi.spyOn(api, 'addToWashing').mockReturnValue(of({ added: 1, existing: 0, total: 1 }));

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
    expect(addWashingSpy).toHaveBeenCalledWith(['item-wash-1']);
    expect(component.items()[0].isInWashing).toBe(true);
  });

  it('should call removeFromWashing when clicking washing button on an item in washing', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(ApiService);
    vi.spyOn(component, 'load').mockImplementation(async () => {});
    const removeWashingSpy = vi.spyOn(api, 'removeFromWashing').mockReturnValue(of({ removed: true }));

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

    expect(removeWashingSpy).toHaveBeenCalledWith('item-wash-2');
    expect(component.items()[0].isInWashing).toBe(false);
  });

  it('should toggle ironing when clicking ironing quick action button', async () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(ApiService);
    vi.spyOn(component, 'load').mockImplementation(async () => {});
    const addIroningSpy = vi.spyOn(api, 'addToIroning').mockReturnValue(of({ added: 1, existing: 0, total: 1 }));
    const removeIroningSpy = vi.spyOn(api, 'removeFromIroning').mockReturnValue(of({ removed: true }));

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

    expect(addIroningSpy).toHaveBeenCalledWith(['item-iron-1']);
    expect(component.items()[0].isInIroning).toBe(true);

    // Now remove
    const updatedItem = component.items()[0];
    await component.toggleIroning(updatedItem, clickEvent);
    fixture.detectChanges();

    expect(removeIroningSpy).toHaveBeenCalledWith('item-iron-1');
    expect(component.items()[0].isInIroning).toBe(false);
  });
});